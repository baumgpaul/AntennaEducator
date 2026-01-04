// Auth Testing Script
// Run this in browser console at http://localhost:3002

console.log('=== Auth Testing Script Started ===');

// Test credentials
const testUser = {
  email: 'test@antennaeducator.com',
  username: 'testuser',
  password: 'TestPassword123!'
};

// Helper to wait for navigation
const waitForNavigation = () => new Promise(resolve => setTimeout(resolve, 1000));

// Step 1: Check auth provider
console.log('\n1. Checking auth provider...');
fetch('http://localhost:3002/src/services/auth/factory.ts')
  .then(() => console.log('✓ Auth factory accessible'))
  .catch(() => console.log('✗ Auth factory error'));

// Step 2: Navigate to register page
console.log('\n2. Navigate to register page');
console.log('Click the "Register" link or navigate to /register');
console.log('Then run: testRegister()');

window.testRegister = async function() {
  console.log('\n=== Testing Registration ===');
  
  // Check if we're on register page
  if (!window.location.pathname.includes('register')) {
    console.error('Please navigate to /register first!');
    return;
  }
  
  // Fill form
  console.log('Filling registration form...');
  const usernameInput = document.querySelector('input[name="username"]');
  const emailInput = document.querySelector('input[name="email"]');
  const passwordInput = document.querySelector('input[name="password"]');
  const confirmPasswordInput = document.querySelector('input[name="confirmPassword"]');
  
  if (!emailInput || !passwordInput) {
    console.error('Form fields not found!');
    return;
  }
  
  // Simulate user input
  const setNativeValue = (element, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      valueSetter.call(element, value);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };
  
  setNativeValue(usernameInput, testUser.username);
  setNativeValue(emailInput, testUser.email);
  setNativeValue(passwordInput, testUser.password);
  setNativeValue(confirmPasswordInput, testUser.password);
  
  console.log('✓ Form filled with:', {
    email: testUser.email,
    username: testUser.username
  });
  
  console.log('Click the "Sign Up" button to submit');
  console.log('Then run: testVerifyRegistration()');
};

window.testVerifyRegistration = function() {
  console.log('\n=== Verifying Registration ===');
  
  // Check localStorage
  const authToken = localStorage.getItem('auth_token');
  const user = localStorage.getItem('user');
  
  if (authToken) {
    console.log('✓ Auth token found:', authToken.substring(0, 20) + '...');
  } else {
    console.error('✗ No auth token in localStorage');
  }
  
  if (user) {
    const userData = JSON.parse(user);
    console.log('✓ User data found:', userData);
  } else {
    console.error('✗ No user data in localStorage');
  }
  
  // Check Redux state
  const reduxState = window.__REDUX_DEVTOOLS_EXTENSION__?.();
  if (reduxState) {
    console.log('✓ Redux state available');
  }
  
  console.log('\nNext: Run testLogout()');
};

window.testLogout = function() {
  console.log('\n=== Testing Logout ===');
  
  // Check current auth state
  const beforeToken = localStorage.getItem('auth_token');
  const beforeUser = localStorage.getItem('user');
  
  console.log('Before logout - Token exists:', !!beforeToken);
  console.log('Before logout - User exists:', !!beforeUser);
  
  console.log('\nClick the user menu (top right) and select "Logout"');
  console.log('Then run: testVerifyLogout()');
};

window.testVerifyLogout = function() {
  console.log('\n=== Verifying Logout ===');
  
  const afterToken = localStorage.getItem('auth_token');
  const afterUser = localStorage.getItem('user');
  
  if (!afterToken) {
    console.log('✓ Auth token removed');
  } else {
    console.error('✗ Auth token still exists');
  }
  
  if (!afterUser) {
    console.log('✓ User data removed');
  } else {
    console.error('✗ User data still exists');
  }
  
  // Check if redirected to login
  if (window.location.pathname.includes('login')) {
    console.log('✓ Redirected to login page');
  }
  
  console.log('\nNext: Run testLogin()');
};

window.testLogin = function() {
  console.log('\n=== Testing Login ===');
  
  // Check if we're on login page
  if (!window.location.pathname.includes('login')) {
    console.error('Please navigate to /login first!');
    return;
  }
  
  console.log('Filling login form...');
  const emailInput = document.querySelector('input[type="email"]');
  const passwordInput = document.querySelector('input[type="password"]');
  
  if (!emailInput || !passwordInput) {
    console.error('Form fields not found!');
    return;
  }
  
  // Simulate user input
  const setNativeValue = (element, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      valueSetter.call(element, value);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };
  
  setNativeValue(emailInput, testUser.email);
  setNativeValue(passwordInput, testUser.password);
  
  console.log('✓ Form filled');
  console.log('Click "Sign In" button');
  console.log('Then run: testVerifyLogin()');
};

window.testVerifyLogin = function() {
  console.log('\n=== Verifying Login ===');
  
  const authToken = localStorage.getItem('auth_token');
  const user = localStorage.getItem('user');
  
  if (authToken) {
    console.log('✓ Auth token restored');
  } else {
    console.error('✗ No auth token');
  }
  
  if (user) {
    const userData = JSON.parse(user);
    console.log('✓ User data restored:', userData);
  } else {
    console.error('✗ No user data');
  }
  
  if (window.location.pathname === '/') {
    console.log('✓ Redirected to home page');
  }
  
  console.log('\n=== All Tests Complete! ===');
  console.log('\nSummary:');
  console.log('- Registration: ' + (authToken && user ? '✓ PASS' : '✗ FAIL'));
  console.log('- Logout: Check if tokens were removed');
  console.log('- Login: ' + (authToken && user ? '✓ PASS' : '✗ FAIL'));
  console.log('\nAuth Provider: LOCAL JWT');
};

console.log('\n=== Instructions ===');
console.log('1. Navigate to register page');
console.log('2. Run: testRegister()');
console.log('3. Click "Sign Up"');
console.log('4. Run: testVerifyRegistration()');
console.log('5. Run: testLogout()');
console.log('6. Click logout in UI');
console.log('7. Run: testVerifyLogout()');
console.log('8. Run: testLogin()');
console.log('9. Click "Sign In"');
console.log('10. Run: testVerifyLogin()');
