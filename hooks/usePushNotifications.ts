import { Platform } from "react-native";
import { useEffect } from "react";
import { WebView } from "react-native-webview";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

interface UsePushNotificationsProps {
  webViewRef: React.RefObject<WebView | null>;
  baseUrl: string;
  setPendingUrl: (url: string | null) => void;
}

export function usePushNotifications({
  webViewRef,
  baseUrl,
  setPendingUrl,
}: UsePushNotificationsProps) {
  async function registerForPushNotificationsAsync() {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1a33d8",
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) {
        throw new Error("Project ID not found");
      }
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.error("Token registration failed:", e);
      return null;
    }
  }

  const handleNotificationResponse = (
    response: Notifications.NotificationResponse,
  ): void => {
    const url = response.notification.request.content.data?.url;
    if (url && typeof url === "string") {
      if (webViewRef.current) {
        const cleanPath = url.startsWith("/") ? url : `/${url}`;
        const targetUrl = url.startsWith("http")
          ? url
          : `${baseUrl}${cleanPath}`;

        webViewRef.current.injectJavaScript(`
          window.location.href = '${targetUrl}';
          true;
        `);
      } else {
        setPendingUrl(url);
      }
    }
  };

  useEffect(() => {
    // Cold Start Check
    const response = Notifications.getLastNotificationResponse();
    const url = response?.notification?.request?.content?.data?.url;
    if (typeof url === "string") {
      setPendingUrl(url);
    }

    // Warm Start Listener
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );

    return () => responseSubscription.remove();
  }, []);

  return { registerForPushNotificationsAsync };
}
