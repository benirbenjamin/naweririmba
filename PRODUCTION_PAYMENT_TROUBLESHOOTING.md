# Production Payment Troubleshooting Checklist

## Current Configuration Issues Fixed:
✅ NODE_ENV changed from 'development' to 'production'
✅ APP_URL changed from 'http://localhost:3000' to 'https://naweririmba.space'
✅ USE_HTTPS changed from 'false' to 'true'
✅ Flutterwave keys are properly configured for live environment

## Potential Issues on Live Server:

### 1. Environment Variables Not Loaded
- The live server might not be reading the .env file
- Solution: Restart the application after .env changes

### 2. SSL/HTTPS Configuration
- Flutterwave requires HTTPS for live payments
- Check if your live server has proper SSL certificate
- Verify HTTPS is working: https://naweririmba.space

### 3. Webhook/Callback URL Issues
- Flutterwave needs to reach: https://naweririmba.space/payment/callback
- Check if this URL is accessible from external services
- Verify no firewall blocking webhook calls

### 4. Database Connection Issues
- Production database might have connection issues
- Check if database credentials are correct for live server

### 5. Memory/Resource Issues
- Live server might be running out of memory
- Check server logs for any errors

## Next Steps:
1. Restart your live application
2. Test a payment on live server
3. Check browser console for frontend errors
4. Check server logs for backend errors
5. Verify webhook URL accessibility

## Test Commands for Live Server:
```bash
# Test if environment variables are loaded
node -e "require('dotenv').config(); console.log('NODE_ENV:', process.env.NODE_ENV); console.log('APP_URL:', process.env.APP_URL);"

# Test payment initialization
node test-production-payment.js

# Check if callback URL is accessible
curl -I https://naweririmba.space/payment/callback
```
