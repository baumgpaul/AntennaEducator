// Cognito PreSignUp Lambda Trigger
// Automatically confirms user email and phone, bypassing verification

exports.handler = async (event) => {
    console.log('PreSignUp trigger invoked:', JSON.stringify(event, null, 2));

    // Auto-confirm the user
    event.response.autoConfirmUser = true;

    // Auto-verify email if provided
    if (event.request.userAttributes.email) {
        event.response.autoVerifyEmail = true;
    }

    // Auto-verify phone if provided
    if (event.request.userAttributes.phone_number) {
        event.response.autoVerifyPhone = true;
    }

    console.log('User auto-confirmed:', event.request.userAttributes.email);

    return event;
};
