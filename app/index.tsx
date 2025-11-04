import * as FileSystem from "expo-file-system/legacy";
import { EncodingType } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  ToastAndroid,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { WebViewNavigation } from "react-native-webview/lib/WebViewTypes";

const CONFIG = {
  appVersion: "1.0.0", // App version number
  appName: "YourApp", // Brand name (used in headers)
  displayName: "YourApp Mobile App", // Full display name (used in User-Agent)
  baseUrl: "https://your-website.com", // Your web application URL
  appId: "com.yourcompany.yourapp", // Bundle/package identifier
  brandId: "yourapp", // Lowercase brand identifier
  windowVars: {
    isMobileApp: "isYourAppMobileApp", // Window variable name for mobile detection
    platform: "yourAppPlatform", // Window variable name for platform
    version: "yourAppVersion", // Window variable name for version
  },
  readyEvent: "yourAppMobileReady", // Custom event name dispatched when ready
  cssPrefix: "yourapp", // CSS class prefix (e.g., 'yourapp-mobile-app')
};

export default function Index() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const lastBackPressed = useRef<number | null>(null);
  const lastUrl = useRef<string>("");

  const buildUrlWithMobileHeaders = (): string => {
    const uri = new URL(CONFIG.baseUrl);
    uri.searchParams.append("mobile", "true");
    uri.searchParams.append("platform", Platform.OS);
    return uri.toString();
  };

  const getMobileHeaders = (): { [key: string]: string } => {
    const platformName = Platform.OS === "android" ? "Android" : "iOS";
    return {
      "User-Agent": `${CONFIG.displayName}/${platformName} ${CONFIG.appName}/${CONFIG.appVersion} (React Native WebView)`,
      "X-Mobile-App": CONFIG.appName,
      "X-Platform": Platform.OS === "android" ? "android" : "ios",
      "X-App-Version": CONFIG.appVersion,
    };
  };

  const injectedJavaScript = `
    (function() {
      // Set detection variables for web app (always, for SPA navigation)
      window.${CONFIG.windowVars.isMobileApp} = true;
      window.${CONFIG.windowVars.platform} = '${Platform.OS}';
      window.${CONFIG.windowVars.version} = '${CONFIG.appVersion}';
      
      // Store in sessionStorage for persistence across SPA navigation
      sessionStorage.setItem('${CONFIG.windowVars.isMobileApp}', 'true');
      sessionStorage.setItem('${CONFIG.windowVars.platform}', '${Platform.OS}');
      sessionStorage.setItem('${CONFIG.windowVars.version}', '${CONFIG.appVersion}');
      
      // Initialize blob handling (only once)
      if (!window.webViewAppInitialized) {
        window.webViewAppInitialized = true;
        window.capturedBlobs = new Map();
        window.lastGeneratedBlobUrl = null;
        window.blobDataCache = new Map();

        // Optimize scroll performance
        const style = document.createElement('style');
        style.textContent = \`
          * {
            -webkit-overflow-scrolling: touch !important;
          }
          body {
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: none !important;
          }
        \`;
        document.head.appendChild(style);

        // Override URL.createObjectURL to cache blob data
        const originalCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = function(blob) {
          const url = originalCreateObjectURL.call(this, blob);
          window.lastGeneratedBlobUrl = url;
          window.capturedBlobs.set(url, blob);

          const reader = new FileReader();
          reader.onload = function(event) {
            try {
              const result = event.target.result;
              const base64Index = result.indexOf(',');
              const base64Data = result.substring(base64Index + 1);
              window.blobDataCache.set(url, {
                data: base64Data,
                type: blob.type || 'application/octet-stream',
                size: blob.size,
                timestamp: Date.now()
              });
            } catch (e) {
              console.error('Failed to cache blob data:', e);
            }
          };
          reader.onerror = function(event) {
            console.error('FileReader error:', event.target.error);
          };
          reader.readAsDataURL(blob);

          // Cache cleanup (limit to 15 items)
          if (window.blobDataCache.size > 15) {
            let oldestUrl = null;
            let oldestTimestamp = Infinity;
            for (const [key, value] of window.blobDataCache.entries()) {
              if (value.timestamp < oldestTimestamp) {
                oldestTimestamp = value.timestamp;
                oldestUrl = key;
              }
            }
            if (oldestUrl) {
              window.capturedBlobs.delete(oldestUrl);
              window.blobDataCache.delete(oldestUrl);
            }
          }
          return url;
        };

        const originalRevokeObjectURL = URL.revokeObjectURL;
        URL.revokeObjectURL = function(url) {
          window.capturedBlobs.delete(url);
          originalRevokeObjectURL.call(this, url);
        };

        // Add CSS classes for web app styling
        if (document.body) {
          document.body.classList.add('${CONFIG.cssPrefix}-mobile-app');
          document.body.classList.add('${CONFIG.cssPrefix}-' + window.${CONFIG.windowVars.platform});
        }

        // Intercept download link clicks
        document.addEventListener('click', function(e) {
          let target = e.target;
          while (target && target.tagName !== 'A') {
            target = target.parentElement;
          }
          if (target && target.tagName === 'A' && target.hasAttribute('download')) {
            const href = target.href || target.getAttribute('href');
            if (href) {
              e.preventDefault();
              e.stopPropagation();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'download',
                url: href,
                filename: target.getAttribute('download') || '',
                isBlob: href.startsWith('blob:')
              }));
            }
          }
        }, true);
      }
      
      // Dispatch mobile app ready event (every time, for SPA navigation)
      window.dispatchEvent(new CustomEvent('${CONFIG.readyEvent}', {
        detail: {
          platform: window.${CONFIG.windowVars.platform},
          version: window.${CONFIG.windowVars.version},
        }
      }));
    })();
  `;

  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert(message);
    }
  };

  const saveFile = async (
    fileUri: string,
    fileName: string,
    mimeType?: string
  ) => {
    try {
      if (Platform.OS === "android") {
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permissions.granted) {
          showToast("Storage permission denied");
          return;
        }
        let finalFileName = fileName;
        if (!finalFileName.includes(".")) {
          // If no extension, try to add one based on MIME type
          const extMap: { [key: string]: string } = {
            "application/pdf": ".pdf",
            "application/zip": ".zip",
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "text/plain": ".txt",
          };
          const ext = mimeType ? extMap[mimeType] : "";
          if (ext) {
            finalFileName += ext;
          }
        }

        const lastDotIndex = finalFileName.lastIndexOf(".");
        const baseName =
          lastDotIndex > 0
            ? finalFileName.substring(0, lastDotIndex)
            : finalFileName;
        const extension =
          lastDotIndex > 0 ? finalFileName.substring(lastDotIndex) : "";
        let existingFileNames: string[] = [];
        try {
          const existingFileUris =
            await FileSystem.StorageAccessFramework.readDirectoryAsync(
              permissions.directoryUri
            );
          existingFileNames = existingFileUris.map((uri) => {
            const decoded = decodeURIComponent(uri);
            const parts = decoded.split("/");
            const lastPart = parts[parts.length - 1];
            return lastPart.includes(":") ? lastPart.split(":")[1] : lastPart;
          });
        } catch {
          // Continue anyway
        }

        let counter = 0;
        let attemptFileName = finalFileName;
        while (existingFileNames.includes(attemptFileName) && counter < 100) {
          counter++;
          attemptFileName = `${baseName} (${counter})${extension}`;
        }
        const newFileUri =
          await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            attemptFileName,
            mimeType || "application/octet-stream"
          );

        const content = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await FileSystem.writeAsStringAsync(newFileUri, content, {
          encoding: FileSystem.EncodingType.Base64,
        });

        showToast("File saved successfully");
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          showToast("Sharing is not available on this device.");
          return;
        }

        const shareOptions: any = {
          dialogTitle: "Save file",
          mimeType: mimeType || "application/octet-stream",
        };

        if (mimeType) {
          const utiMap: { [key: string]: string } = {
            "application/pdf": "com.adobe.pdf",
            "application/zip": "public.zip-archive",
            "image/jpeg": "public.jpeg",
            "image/png": "public.png",
            "text/plain": "public.plain-text",
          };
          if (utiMap[mimeType]) {
            shareOptions.UTI = utiMap[mimeType];
          }
        }

        await Sharing.shareAsync(fileUri, shareOptions);
      }
    } catch (error) {
      showToast("Could not save file: " + (error as Error).message);
    }
  };

  const getMimeTypeFromExtension = (filename: string): string => {
    const ext = filename.toLowerCase().split(".").pop();
    const mimeTypes: { [key: string]: string } = {
      pdf: "application/pdf",
      zip: "application/zip",
      rar: "application/x-rar-compressed",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      csv: "text/csv",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      avi: "video/x-msvideo",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  };

  const downloadFile = async (url: string, suggestedFilename?: string) => {
    let fileName =
      suggestedFilename && suggestedFilename.trim() !== ""
        ? suggestedFilename
        : url.substring(url.lastIndexOf("/") + 1).split("?")[0];

    if (!fileName || fileName === "") {
      fileName = `download_${Date.now()}`;
    }

    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    showToast("Starting download...");

    try {
      const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
        headers: getMobileHeaders(),
      });

      if (downloadResult.status === 200) {
        let mimeType =
          downloadResult.headers?.["Content-Type"] ||
          downloadResult.headers?.["content-type"];

        if (!mimeType) {
          mimeType = getMimeTypeFromExtension(fileName);
        }

        showToast("Download complete");
        await saveFile(downloadResult.uri, fileName, mimeType);
      } else {
        throw new Error(
          `Download failed: Status code ${downloadResult.status}`
        );
      }
    } catch (error) {
      showToast("Download failed: " + (error as Error).message);
    }
  };

  const handleBlobDownload = async (
    url: string,
    retryCount = 0,
    suggestedFilename?: string
  ) => {
    if (!webViewRef.current) return;

    try {
      const script = `
        (function() {
          const blobData = window.blobDataCache.get('${url}');
          if (blobData) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'blobDownload',
              data: blobData,
              url: '${url}',
              suggestedFilename: '${suggestedFilename || ""}'
            }));
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'blobDownload',
              error: 'Blob data not found in cache',
              url: '${url}',
              retry: ${retryCount},
              suggestedFilename: '${suggestedFilename || ""}'
            }));
          }
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    } catch {
      showToast("Blob download failed.");
    }
  };

  const onMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === "download") {
        if (message.isBlob) {
          handleBlobDownload(message.url, 0, message.filename);
        } else {
          downloadFile(message.url, message.filename);
        }
        return;
      }

      if (message.type === "blobDownload") {
        if (message.error) {
          const retryCount = message.retry || 0;
          if (retryCount < 5) {
            setTimeout(() => {
              handleBlobDownload(
                message.url,
                retryCount + 1,
                message.suggestedFilename
              );
            }, 100 * (retryCount + 1));
            return;
          }
          throw new Error(message.error);
        }

        const { data: base64Data, type: mimeType } = message.data;
        let fileName =
          message.suggestedFilename && message.suggestedFilename.trim() !== "";
        if (!fileName) {
          const extension = (mimeType.split("/")[1] || "bin").split("+")[0];
          fileName = `download_${Date.now()}.${extension}`;
        } else {
          fileName = message.suggestedFilename;
        }

        const fileUri = `${FileSystem.documentDirectory}${fileName}`;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: EncodingType.Base64,
        });

        await saveFile(fileUri, fileName, mimeType);
      }
    } catch (error) {
      showToast("Download failed: " + (error as Error).message);
    }
  };

  const onShouldStartLoadWithRequest = (
    request: WebViewNavigation
  ): boolean => {
    const { url } = request;

    if (url.startsWith("blob:")) {
      handleBlobDownload(url);
      return false;
    }

    const DOWNLOAD_EXTENSIONS = [
      ".pdf",
      ".zip",
      ".rar",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".mp3",
      ".mp4",
      ".avi",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".txt",
      ".csv",
    ];

    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch {
      return true;
    }

    if (DOWNLOAD_EXTENSIONS.some((ext) => path.endsWith(ext))) {
      downloadFile(url);
      return false;
    }

    if (!url.startsWith("http:") && !url.startsWith("https:")) {
      Linking.openURL(url).catch((err) =>
        console.error("Failed to open external URL:", err)
      );
      return false;
    }

    return true;
  };

  const onAndroidBackPress = useCallback(() => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }

    const now = Date.now();
    if (lastBackPressed.current && now - lastBackPressed.current < 2000) {
      BackHandler.exitApp();
      return true;
    }

    lastBackPressed.current = now;
    showToast("Press back again to exit");
    return true;
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS === "android") {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onAndroidBackPress
      );
      return () => subscription.remove();
    }
  }, [onAndroidBackPress]);

  const webViewSource = {
    uri: buildUrlWithMobileHeaders(),
    headers: getMobileHeaders(),
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={styles.safeArea.backgroundColor}
      />
      <View style={styles.flexContainer}>
        <WebView
          ref={webViewRef}
          source={webViewSource}
          style={styles.flexContainer}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onLoadProgress={({ nativeEvent }) =>
            setIsLoading(nativeEvent.progress < 1)
          }
          onError={(syntheticEvent) => {
            setIsLoading(false);
            const { nativeEvent } = syntheticEvent;
            showToast(`Error: ${nativeEvent.description}`);
          }}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setIsLoading(navState.loading);

            if (
              !navState.loading &&
              navState.url &&
              navState.url !== lastUrl.current
            ) {
              lastUrl.current = navState.url;
              if (webViewRef.current) {
                webViewRef.current.injectJavaScript(injectedJavaScript);
              }
            }
          }}
          onMessage={onMessage}
          injectedJavaScript={injectedJavaScript}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          {...(Platform.OS === "ios" && {
            onFileDownload: ({ nativeEvent }) => {
              if (nativeEvent.downloadUrl.startsWith("blob:")) {
                handleBlobDownload(nativeEvent.downloadUrl);
              } else {
                downloadFile(nativeEvent.downloadUrl);
              }
            },
          })}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          allowsFullscreenVideo={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={["*"]}
          pullToRefreshEnabled={true}
          {...(Platform.OS === "android" && {
            overScrollMode: "never",
            nestedScrollEnabled: true,
          })}
          {...(Platform.OS === "ios" && {
            decelerationRate: "normal",
            bounces: true,
          })}
        />
        {isLoading && (
          <ActivityIndicator
            color="#1976D2"
            size="large"
            style={styles.loadingIndicator}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flexContainer: {
    flex: 1,
  },
  loadingIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
