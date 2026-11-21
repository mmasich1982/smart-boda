// rider-app/src/screens/admin/BusinessMapView.js   (phones: Android and iOS)
// The Businesses Map page (admin/mapHtml.js) inside a WebView. The page loads Leaflet and the OpenStreetMap tiles itself, so this needs the internet.
// "Open in Google Maps" inside a popup is handed to the phone's own maps app; the WebView never navigates anywhere else.
// Needs the react-native-webview package (npx expo install react-native-webview) and a new app build.
import React, { useMemo } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildMapHtml } from '../../admin/mapHtml';

export default function BusinessMapView({ points, height = 440 }) {
  const html = useMemo(() => buildMapHtml(points), [points]);
  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e7e4db', marginBottom: 12 }} testID="map-view">
      <WebView originWhitelist={['*']} source={{ html }} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => { if (/^https:\/\/www\.google\.com\/maps/.test(req.url)) { Linking.openURL(req.url); return false; } return req.url === 'about:blank' || req.url.startsWith('data:'); }} />
    </View>
  );
}
