"""AWS Cognito service for user management in AWS mode.

This module provides functions to interact with AWS Cognito for:
- User registration (sign up)
- User authentication (sign in)
- Email verification
- Admin approval management (stored in DynamoDB)
"""

import boto3
import logging
import os
from typing import Dict, Optional
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Cognito configuration from environment
COGNITO_REGION = os.getenv("COGNITO_REGION", "eu-west-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")

# DynamoDB configuration
DYNAMODB_TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging")

# Initialize AWS clients
cognito_idp = boto3.client('cognito-idp', region_name=COGNITO_REGION)
dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
users_table = dynamodb.Table(DYNAMODB_TABLE_NAME)


def register_user(email: str, username: str, password: str) -> Dict:
    """
    Register a new user in Cognito and create DynamoDB record.
    
    Args:
        email: User's email address
        username: Username
        password: User's password
        
    Returns:
        Dict with user information and status
        
    Raises:
        ValueError: If registration fails
    """
    try:
        # Sign up user in Cognito
        response = cognito_idp.sign_up(
            ClientId=COGNITO_CLIENT_ID,
            Username=email,  # Use email as username
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
            ]
        )
        
        user_sub = response['UserSub']
        logger.info(f"User registered in Cognito: {email} (sub={user_sub})")
        
        # Auto-confirm user to skip email verification
        # This allows immediate login without requiring email verification
        try:
            cognito_idp.admin_confirm_sign_up(
                UserPoolId=COGNITO_USER_POOL_ID,
                Username=email
            )
            logger.info(f"User auto-confirmed (email verification bypassed): {email}")
            email_verified = True
        except ClientError as e:
            logger.warning(f"Failed to auto-confirm user: {e}")
            email_verified = False
        
        # Create user record in DynamoDB
        # Users are unlocked by default in the new architecture
        from datetime import datetime
        users_table.put_item(
            Item={
                'PK': f'USER#{user_sub}',
                'SK': 'METADATA',
                'user_id': user_sub,
                'email': email,
                'username': username,
                'is_approved': True,  # Keep for backward compatibility
                'is_locked': False,  # Users unlocked by default
                'is_admin': False,
                'created_at': datetime.utcnow().isoformat(),
                'entity_type': 'user'
            }
        )
        logger.info(f"User record created in DynamoDB: {email} (unlocked by default)")
        
        
        return {
            'user_sub': user_sub,
            'email': email,
            'username': username,
            'email_verified': email_verified,
            'is_approved': True,
            'is_locked': False
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        logger.error(f"Cognito registration error: {error_code} - {error_message}")
        
        if error_code == 'UsernameExistsException':
            raise ValueError("Email already registered")
        elif error_code == 'InvalidPasswordException':
            raise ValueError("Password does not meet requirements")
        elif error_code == 'InvalidParameterException':
            raise ValueError(error_message)
        else:
            raise RuntimeError(f"Registration failed: {error_message}")


def verify_email(email: str, verification_code: str) -> Dict:
    """
    Verify user's email with the code sent by Cognito.
    
    Args:
        email: User's email address
        verification_code: 6-digit code from email
        
    Returns:
        Dict with verification status
        
    Raises:
        ValueError: If verification fails
    """
    try:
        # Confirm sign up with verification code
        cognito_idp.confirm_sign_up(
            ClientId=COGNITO_CLIENT_ID,
            Username=email,
            ConfirmationCode=verification_code
        )
        
        logger.info(f"Email verified successfully: {email}")
        
        return {
            'message': 'Email verified successfully. You can now login once an admin approves your account.',
            'email_verified': True
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        logger.error(f"Email verification error: {error_code} - {error_message}")
        
        if error_code == 'CodeMismatchException':
            raise ValueError("Invalid verification code")
        elif error_code == 'ExpiredCodeException':
            raise ValueError("Verification code expired. Please request a new code.")
        elif error_code == 'NotAuthorizedException':
            raise ValueError("User already verified or does not exist")
        else:
            raise RuntimeError(f"Verification failed: {error_message}")


def resend_verification_code(email: str) -> Dict:
    """
    Resend verification code to user's email.
    
    Args:
        email: User's email address
        
    Returns:
        Dict with status message
        
    Raises:
        ValueError: If resend fails
    """
    try:
        cognito_idp.resend_confirmation_code(
            ClientId=COGNITO_CLIENT_ID,
            Username=email
        )
        
        logger.info(f"Verification code resent to: {email}")
        
        return {
            'message': 'Verification code sent. Please check your email.'
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        logger.error(f"Resend verification error: {error_code} - {error_message}")
        
        if error_code == 'UserNotFoundException':
            raise ValueError("User not found")
        elif error_code == 'InvalidParameterException':
            raise ValueError("User already verified")
        else:
            raise RuntimeError(f"Failed to resend code: {error_message}")


def authenticate_user(email: str, password: str) -> Dict:
    """
    Authenticate user with Cognito.
    
    Args:
        email: User's email address
        password: User's password
        
    Returns:
        Dict with access token and user info
        
    Raises:
        ValueError: If authentication fails
    """
    try:
        # Initiate auth with Cognito
        response = cognito_idp.initiate_auth(
            ClientId=COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': email,
                'PASSWORD': password
            }
        )
        
        # Check if challenge is required (e.g., NEW_PASSWORD_REQUIRED)
        if 'ChallengeName' in response:
            raise ValueError(f"Authentication challenge required: {response['ChallengeName']}")
        
        # Get tokens
        auth_result = response['AuthenticationResult']
        access_token = auth_result['AccessToken']
        id_token = auth_result['IdToken']
        refresh_token = auth_result.get('RefreshToken')
        expires_in = auth_result.get('ExpiresIn', 3600)
        
        # Decode the ID token to get user info (without verification for now)
        # In production, verify the token signature using Cognito public keys
        import json
        import base64
        
        # Decode ID token payload (second part of JWT)
        parts = id_token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid ID token format")
        
        payload_part = parts[1]
        # Add padding if needed
        padding = 4 - (len(payload_part) % 4)
        if padding != 4:
            payload_part += '=' * padding
        
        payload_bytes = base64.urlsafe_b64decode(payload_part)
        payload = json.loads(payload_bytes.decode('utf-8'))
        
        user_sub = payload.get('sub')
        
        # Check approval status in DynamoDB
        try:
            response = users_table.get_item(
                Key={
                    'PK': f'USER#{user_sub}',
                    'SK': 'METADATA'
                }
            )
            user_item = response.get('Item')
            
            if not user_item:
                raise ValueError("User record not found")
            
            # Check if user is locked (new architecture)
            is_locked = user_item.get('is_locked', False)
            if is_locked:
                raise ValueError("Account is locked. Please contact administrator.")
            
            is_admin = user_item.get('is_admin', False)
            
        except ClientError as e:
            logger.error(f"DynamoDB error checking user status: {e}")
            raise ValueError("Error checking user status")
        
        logger.info(f"User authenticated: {email}")
        
        return {
            'access_token': access_token,
            'id_token': id_token,
            'refresh_token': refresh_token,
            'token_type': 'Bearer',
            'expires_in': expires_in,
            'user': {
                'sub': user_sub,
                'email': payload.get('email'),
                'username': user_item.get('username', payload.get('cognito:username')),
                'email_verified': payload.get('email_verified', False),
                'is_approved': True,  # Keep for backward compatibility
                'is_locked': False,  # If we got here, user is not locked
                'is_admin': is_admin,
            }
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        logger.error(f"Cognito authentication error: {error_code} - {error_message}")
        
        if error_code == 'NotAuthorizedException':
            raise ValueError("Incorrect email or password")
        elif error_code == 'UserNotConfirmedException':
            raise ValueError("Email not verified. Please check your email for verification link.")
        elif error_code == 'UserNotFoundException':
            raise ValueError("Incorrect email or password")
        else:
            raise RuntimeError(f"Authentication failed: {error_message}")


def get_user_info(access_token: str) -> Dict:
    """
    Get user information from Cognito using access token.
    
    Args:
        access_token: Cognito access token
        
    Returns:
        Dict with user attributes
    """
    try:
        response = cognito_idp.get_user(AccessToken=access_token)
        
        # Parse user attributes
        attributes = {}
        for attr in response['UserAttributes']:
            attributes[attr['Name']] = attr['Value']
        
        user_sub = attributes.get('sub')
        
        # Get approval status from DynamoDB
        try:
            db_response = users_table.get_item(
                Key={
                    'PK': f'USER#{user_sub}',
                    'SK': 'METADATA'
                }
            )
            user_item = db_response.get('Item', {})
            is_approved = user_item.get('is_approved', False)
            is_admin = user_item.get('is_admin', False)
            username = user_item.get('username', response['Username'])
        except ClientError:
            # Fallback if DynamoDB record doesn't exist
            is_approved = False
            is_admin = False
            username = response['Username']
        
        return {
            'username': username,
            'email': attributes.get('email'),
            'email_verified': attributes.get('email_verified') == 'true',
            'sub': user_sub,
            'is_approved': is_approved,
            'is_admin': is_admin,
        }
        
    except ClientError as e:
        logger.error(f"Failed to get user info: {e}")
        raise RuntimeError("Failed to retrieve user information")


def admin_set_user_approved(user_sub: str, approved: bool = True, is_admin: bool = False) -> None:
    """
    Admin function to set user approval status in DynamoDB.
    
    Args:
        user_sub: User's Cognito sub (ID)
        approved: Whether to approve or unapprove user
        is_admin: Whether to grant admin privileges
    """
    try:
        users_table.update_item(
            Key={
                'PK': f'USER#{user_sub}',
                'SK': 'METADATA'
            },
            UpdateExpression='SET is_approved = :approved, is_admin = :admin',
            ExpressionAttributeValues={
                ':approved': approved,
                ':admin': is_admin
            }
        )
        logger.info(f"User {user_sub} approval status set to: {approved}, admin: {is_admin}")
        
    except ClientError as e:
        logger.error(f"Failed to update user approval: {e}")
        raise RuntimeError(f"Failed to update user approval status: {e}")
