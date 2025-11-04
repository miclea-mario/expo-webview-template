# Expo WebView App Template 📱

A production-ready React Native WebView template built with Expo. This template provides a complete mobile wrapper for web applications with support for downloads, blob handling, custom headers, and native back button behavior.

## Features

- ✅ **Full WebView Implementation** - Complete mobile wrapper for web apps
- ✅ **Download Support** - Handle both regular files and blob downloads
- ✅ **Native Integration** - Custom headers, platform detection, and back button handling
- ✅ **File Sharing** - Share downloaded files with other apps
- ✅ **Blob URL Support** - Cache and download blob-generated files
- ✅ **Pull-to-Refresh** - Native pull-to-refresh functionality
- ✅ **Loading Indicators** - Visual feedback during page loads
- ✅ **Error Handling** - Comprehensive error handling and user feedback

## Get Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your application

Edit `app/index.tsx` and update the `CONFIG` object:

```typescript
const CONFIG = {
  appVersion: "1.0.0",                    // App version number
  appName: "YourApp",                     // Brand name (used in headers)
  displayName: "YourApp Mobile App",      // Full display name (used in User-Agent)
  baseUrl: "https://your-website.com",    // Your web application URL
  appId: "com.yourcompany.yourapp",       // Bundle/package identifier
  brandId: "yourapp",                     // Lowercase brand identifier
  windowVars: {
    isMobileApp: "isYourAppMobileApp",    // Window variable name for mobile detection
    platform: "yourAppPlatform",          // Window variable name for platform
    version: "yourAppVersion",            // Window variable name for version
  },
  readyEvent: "yourAppMobileReady",       // Custom event name dispatched when ready
  cssPrefix: "yourapp",                   // CSS class prefix (e.g., 'yourapp-mobile-app')
};
```

**Important:** These values are used throughout the app for:

- HTTP headers (`User-Agent`, `X-Mobile-App`)
- JavaScript window variables injected into the WebView
- sessionStorage keys
- CSS classes added to `document.body`
- Custom events dispatched to the web app

### 3. Start the development server

```bash
npx expo start
```

Then press:

- `a` - open on Android emulator
- `i` - open on iOS simulator
- Scan QR code with Expo Go app on your physical device

## Project Structure

```text
app/
  ├── index.tsx       # Main WebView component with all features
  └── _layout.tsx     # Root layout (navigation wrapper)
assets/
  └── images/         # App icons and splash screens
```

## Key Features Explained

### Download Handling

The app automatically intercepts downloads for common file types (PDF, ZIP, images, etc.) and blob URLs. Files are downloaded using the native filesystem and can be shared with other apps.

### Custom Headers

The app sends custom headers with every request to help your web app detect it's running in a mobile context:

```typescript
{
  "User-Agent": "Your App Name Mobile App/[platform]",
  "X-Mobile-App": "Your App Name",
  "X-Platform": "Android" | "iOS",
  "X-App-Version": "1.0.0"
}
```

### JavaScript Injection

The template injects JavaScript that sets global variables in your web app:

```javascript
window.isWebViewApp = true;
window.webViewAppPlatform = "android" | "ios";
window.webViewAppVersion = "1.0.0";
```

Your web app can use these to detect it's running in the mobile wrapper.

### Back Button Behavior

On Android, the back button:

1. Goes back in WebView history if possible
2. Otherwise, shows "Press back again to exit" toast
3. Exits app if pressed twice within 2 seconds

## Building for Production

### Android

```bash
npx expo build:android
```

### iOS

```bash
npx expo build:ios
```

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native WebView](https://github.com/react-native-webview/react-native-webview)
- [Expo File System](https://docs.expo.dev/versions/latest/sdk/filesystem/)

## License

MIT
