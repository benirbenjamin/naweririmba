// Authentication forms handler with loading states
document.addEventListener('DOMContentLoaded', function() {
    // Handle login form
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    
    if (loginForm && loginButton) {
        loginForm.addEventListener('submit', function(e) {
            // Show loading state
            showLoginLoading();
            
            // Allow natural form submission to continue
            // The form will submit normally to the server
        });
    }
    
    // Handle register form
    const registerForm = document.getElementById('registerForm');
    const registerButton = document.getElementById('registerButton');
    
    if (registerForm && registerButton) {
        registerForm.addEventListener('submit', function(e) {
            // Show loading state
            showRegisterLoading();
            
            // Allow natural form submission to continue
            // The form will submit normally to the server
        });
    }
    
    function showLoginLoading() {
        const loginText = loginButton.querySelector('.login-text');
        const loginSpinner = loginButton.querySelector('.login-spinner');
        
        if (loginText && loginSpinner) {
            loginText.classList.add('d-none');
            loginSpinner.classList.remove('d-none');
            loginButton.disabled = true;
        }
    }
    
    function hideLoginLoading() {
        const loginText = loginButton.querySelector('.login-text');
        const loginSpinner = loginButton.querySelector('.login-spinner');
        
        if (loginText && loginSpinner) {
            loginText.classList.remove('d-none');
            loginSpinner.classList.add('d-none');
            loginButton.disabled = false;
        }
    }
    
    function showRegisterLoading() {
        const registerText = registerButton.querySelector('.register-text');
        const registerSpinner = registerButton.querySelector('.register-spinner');
        
        if (registerText && registerSpinner) {
            registerText.classList.add('d-none');
            registerSpinner.classList.remove('d-none');
            registerButton.disabled = true;
        }
    }
    
    function hideRegisterLoading() {
        const registerText = registerButton.querySelector('.register-text');
        const registerSpinner = registerButton.querySelector('.register-spinner');
        
        if (registerText && registerSpinner) {
            registerText.classList.remove('d-none');
            registerSpinner.classList.add('d-none');
            registerButton.disabled = false;
        }
    }
    
    // Hide loading states if form submission fails and page reloads with error
    // This handles cases where server validation fails and returns to the same page
    hideLoginLoading();
    hideRegisterLoading();
});
