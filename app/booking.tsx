import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';

export default function BookingScreen() {
  const { url, platform, flightNo } = useLocalSearchParams<{ url: string; platform: string; flightNo: string }>();
  const webviewRef = useRef<WebView>(null);
  const [status, setStatus] = useState('正在打开页面...');
  const [passenger, setPassenger] = useState<any>(null);
  const [currentUrl, setCurrentUrl] = useState(url || '');

  useEffect(() => {
    AsyncStorage.multiGet(['name', 'idNumber', 'phone']).then(values => {
      const data: any = {};
      values.forEach(([key, value]) => {
        if (value) data[key] = value;
      });
      if (!data.name || !data.idNumber || !data.phone) {
        setStatus('⚠️ 乘客信息不完整，请返回填写');
      }
      setPassenger(data);
    });
  }, []);

  // Web端fallback
  if (Platform.OS === 'web') {
    useEffect(() => {
      window.open(url!, '_blank');
    }, []);
    
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.webText}>已在新标签页打开订票页</Text>
          <Text style={s.webTip}>请手动填写信息完成订票</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 自动填表脚本（改进版）
  const getFillScript = () => {
    if (!passenger) return '';
    
    return `
      (function() {
        const passenger = ${JSON.stringify(passenger)};
        
        function fillInput(el, value) {
          if (!el || !value) return false;
          el.focus();
          el.click();
          
          try {
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } catch(e) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          for (var i = 0; i < value.length; i++) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: value[i], bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: value[i], bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: value[i], bubbles: true }));
          }
          
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        
        function findInput(selectors) {
          for (let i = 0; i < selectors.length; i++) {
            const els = document.querySelectorAll(selectors[i]);
            for (let j = 0; j < els.length; j++) {
              const el = els[j];
              if (el && el.offsetParent !== null && !el.disabled) {
                return el;
              }
            }
          }
          return null;
        }
        
        function sendStatus(msg) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'status', message: msg }));
        }
        
        function tryFill() {
          sendStatus('正在分析页面...');
          
          const nameInput = findInput([
            'input[placeholder*="旅客"]',
            'input[placeholder*="姓名"]',
            'input[name*="name" i]',
          ]);
          
          const idInput = findInput([
            'input[placeholder*="证件"]',
            'input[placeholder*="身份证"]',
            'input[name*="card" i]',
            'input[name*="idno" i]',
          ]);
          
          const phoneInput = findInput([
            'input[placeholder*="手机"]',
            'input[placeholder*="电话"]',
            'input[type="tel"]',
            'input[name*="phone" i]',
          ]);
          
          let filled = 0;
          if (nameInput) { fillInput(nameInput, passenger.name); filled++; }
          if (idInput) { fillInput(idInput, passenger.idNumber); filled++; }
          if (phoneInput) { fillInput(phoneInput, passenger.phone); filled++; }
          
          if (filled > 0) {
            sendStatus('已填写' + filled + '个字段 ✓');
          } else {
            sendStatus('未找到表单，可能还在搜索页');
          }
          
          return filled;
        }
        
        let attempts = 0;
        const timer = setInterval(function() {
          attempts++;
          const filled = tryFill();
          if (filled > 0 || attempts > 20) {
            clearInterval(timer);
          }
        }, 2000);
        
        sendStatus('等待页面加载...');
      })();
      true;
    `;
  };

  const isOrderPage = (pageUrl: string) => {
    return pageUrl.includes('order') || pageUrl.includes('booking') || pageUrl.includes('book') || pageUrl.includes('fill');
  };

  const onLoadEnd = () => {
    if (!passenger) {
      setStatus('未保存乘客信息，请返回填写');
      return;
    }
    
    if (isOrderPage(currentUrl)) {
      const script = getFillScript();
      webviewRef.current?.injectJavaScript(script);
    } else {
      setStatus('请在页面中选择航班，进入订票页后自动填表');
    }
  };

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'status') {
        setStatus(data.message);
      }
    } catch (e) {}
  };

  const onNavigationStateChange = (navState: any) => {
    setCurrentUrl(navState.url || '');
    
    if (isOrderPage(navState.url) && passenger) {
      setTimeout(() => {
        const script = getFillScript();
        webviewRef.current?.injectJavaScript(script);
      }, 2000);
    }
  };

  const manualFill = () => {
    if (!passenger) return;
    const script = getFillScript();
    webviewRef.current?.injectJavaScript(script);
    setStatus('正在尝试填表...');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.statusBar}>
        <Text style={s.statusText} numberOfLines={1}>{status}</Text>
        <TouchableOpacity style={s.fillBtn} onPress={manualFill}>
          <Text style={s.fillBtnText}>填表</Text>
        </TouchableOpacity>
      </View>

      <WebView
        ref={webviewRef}
        source={{ uri: url! }}
        style={s.webview}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onNavigationStateChange={onNavigationStateChange}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#1a73e8" />
            <Text style={s.loadText}>加载中...</Text>
          </View>
        )}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  webText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  webTip: { fontSize: 14, color: '#888' },
  statusBar: { flexDirection: 'row', alignItems: 'center', padding: 8, paddingHorizontal: 14, backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderColor: '#eee' },
  statusText: { flex: 1, fontSize: 13, color: '#666' },
  fillBtn: { backgroundColor: '#1a73e8', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  fillBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  webview: { flex: 1 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadText: { marginTop: 12, color: '#888' },
});
