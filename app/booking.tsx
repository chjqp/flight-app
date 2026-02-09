import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';

export default function BookingScreen() {
  const { url, platform, flightNo } = useLocalSearchParams<{ url: string; platform: string; flightNo: string }>();
  const webviewRef = useRef<WebView>(null);
  const [status, setStatus] = useState('正在打开页面...');
  const [logs, setLogs] = useState<string[]>(['📱 启动订票流程...']);
  const [passenger, setPassenger] = useState<any>(null);
  const [currentUrl, setCurrentUrl] = useState(url || '');

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} ${msg}`]);
    setStatus(msg);
  };

  useEffect(() => {
    addLog('🔍 正在读取乘客信息...');
    AsyncStorage.multiGet(['name', 'idNumber', 'phone']).then(values => {
      const data: any = {};
      values.forEach(([key, value]) => {
        if (value) data[key] = value;
      });
      if (!data.name || !data.idNumber || !data.phone) {
        addLog('⚠️ 乘客信息不完整，请返回填写');
        setStatus('⚠️ 乘客信息不完整，请返回填写');
      } else {
        addLog(`✓ 已读取：${data.name}, ${data.idNumber.substring(0,4)}..., ${data.phone.substring(0,3)}...`);
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

  // 自动填表脚本（改进版 - 修复字段识别错误）
  const getFillScript = () => {
    if (!passenger) return '';
    
    return `
      (function() {
        const passenger = ${JSON.stringify(passenger)};
        const usedInputs = new Set();
        
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
        
        function findInput(selectors, expectedValue, fieldName) {
          for (let i = 0; i < selectors.length; i++) {
            const els = document.querySelectorAll(selectors[i]);
            for (let j = 0; j < els.length; j++) {
              const el = els[j];
              if (el && el.offsetParent !== null && !el.disabled && !usedInputs.has(el)) {
                // 尝试填写
                const filled = fillInput(el, expectedValue);
                if (!filled) continue;
                
                // 等待一下让值稳定
                setTimeout(function() {}, 100);
                
                // 验证值是否正确填入（宽松验证）
                const currentValue = el.value || '';
                if (currentValue === expectedValue || 
                    currentValue.includes(expectedValue) ||
                    expectedValue.includes(currentValue)) {
                  usedInputs.add(el);
                  sendStatus('✓ ' + fieldName + ': 已填写到 ' + selectors[i]);
                  return { el: el, success: true };
                }
              }
            }
          }
          sendStatus('✗ ' + fieldName + ': 未找到匹配的输入框');
          return { el: null, success: false };
        }
        
        function sendStatus(msg) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'status', message: msg }));
        }
        
        function sendLog(msg) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
        }
        
        function tryFill() {
          sendLog('🔍 开始分析页面结构...');
          sendStatus('正在分析页面...');
          
          const results = [];
          
          // 填写姓名
          sendLog('📝 正在填写姓名...');
          const nameResult = findInput([
            'input[placeholder*="姓名"]',
            'input[placeholder*="乘机人"]',
            'input[placeholder*="旅客"]',
            'input[placeholder*="乘客"]',
            'input[name*="name" i]',
            'input[type="text"]:not([placeholder*="证件"]):not([placeholder*="手机"]):not([placeholder*="电话"])',
          ], passenger.name, '姓名');
          
          if (nameResult.success) {
            const displayName = passenger.name.length > 2 ? passenger.name.substring(0, 2) + '...' : passenger.name;
            results.push('✓ 姓名: ' + displayName);
            sendLog('✓ 姓名已填写');
          } else {
            sendLog('✗ 姓名字段未找到');
          }
          
          // 填写身份证
          sendLog('📝 正在填写身份证...');
          const idResult = findInput([
            'input[placeholder*="身份证"]',
            'input[placeholder*="证件号码"]',
            'input[placeholder*="证件号"]',
            'input[placeholder*="证件"]',
            'input[name*="idno" i]',
            'input[name*="card" i]',
            'input[name*="credential" i]',
          ], passenger.idNumber, '身份证');
          
          if (idResult.success) {
            const displayId = passenger.idNumber.length > 4 ? passenger.idNumber.substring(0, 4) + '...' : passenger.idNumber;
            results.push('✓ 身份证: ' + displayId);
            sendLog('✓ 身份证已填写');
          } else {
            sendLog('✗ 身份证字段未找到');
          }
          
          // 填写手机
          sendLog('📝 正在填写手机号...');
          const phoneResult = findInput([
            'input[placeholder*="手机"]',
            'input[placeholder*="联系手机"]',
            'input[placeholder*="电话"]',
            'input[type="tel"]',
            'input[name*="phone" i]',
            'input[name*="mobile" i]',
          ], passenger.phone, '手机');
          
          if (phoneResult.success) {
            const displayPhone = passenger.phone.length > 3 ? passenger.phone.substring(0, 3) + '...' : passenger.phone;
            results.push('✓ 手机: ' + displayPhone);
            sendLog('✓ 手机号已填写');
          } else {
            sendLog('✗ 手机号字段未找到');
          }
          
          if (results.length > 0) {
            sendStatus(results.join('  '));
            sendLog('✅ 自动填表完成，共填写 ' + results.length + ' 个字段');
            // 延迟发送汇总消息
            setTimeout(function() {
              sendStatus('✅ 已完成自动填表，共填写 ' + results.length + ' 个字段');
            }, 500);
          } else {
            sendLog('⚠️ 未找到表单，可能还在搜索页');
            sendStatus('未找到表单，可能还在搜索页');
          }
          
          return results.length;
        }
        
        let attempts = 0;
        const timer = setInterval(function() {
          attempts++;
          sendLog('🔄 尝试填表 (' + attempts + '/20)...');
          const filled = tryFill();
          if (filled > 0 || attempts > 20) {
            clearInterval(timer);
            if (attempts > 20 && filled === 0) {
              sendLog('⏱️ 超时：未找到表单');
            }
          }
        }, 2000);
        
        sendLog('⏳ 等待页面加载...');
        sendStatus('等待页面加载...');
      })();
      true;
    `;
  };

  const isOrderPage = (pageUrl: string) => {
    return pageUrl.includes('order') || pageUrl.includes('booking') || pageUrl.includes('book') || pageUrl.includes('fill');
  };

  const onLoadEnd = () => {
    addLog('✓ 页面加载完成');
    if (!passenger) {
      addLog('⚠️ 未保存乘客信息，请返回填写');
      setStatus('未保存乘客信息，请返回填写');
      return;
    }
    
    if (isOrderPage(currentUrl)) {
      addLog('✓ 检测到订票页，准备自动填表');
      const script = getFillScript();
      webviewRef.current?.injectJavaScript(script);
    } else {
      addLog('ℹ️ 当前在搜索页，请选择航班');
      setStatus('请在页面中选择航班，进入订票页后自动填表');
    }
  };

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'status') {
        setStatus(data.message);
      } else if (data.type === 'log') {
        addLog(data.message);
      }
    } catch (e) {}
  };

  const onNavigationStateChange = (navState: any) => {
    const newUrl = navState.url || '';
    if (newUrl !== currentUrl) {
      addLog(`🌐 页面跳转: ${newUrl.substring(0, 50)}...`);
    }
    setCurrentUrl(newUrl);
    
    if (isOrderPage(navState.url) && passenger) {
      addLog('✓ 检测到订票页，2秒后自动填表');
      setTimeout(() => {
        const script = getFillScript();
        webviewRef.current?.injectJavaScript(script);
      }, 2000);
    }
  };

  const manualFill = () => {
    if (!passenger) return;
    addLog('🔄 手动触发填表');
    const script = getFillScript();
    webviewRef.current?.injectJavaScript(script);
    setStatus('正在尝试填表...');
  };

  const [showLogs, setShowLogs] = useState(false);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.statusBar}>
        <Text style={s.statusText} numberOfLines={1}>{status}</Text>
        <TouchableOpacity style={s.fillBtn} onPress={manualFill}>
          <Text style={s.fillBtnText}>填表</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.logBtn} onPress={() => setShowLogs(!showLogs)}>
          <Text style={s.logBtnText}>{showLogs ? '隐藏' : '日志'}</Text>
        </TouchableOpacity>
      </View>

      {showLogs && (
        <View style={s.logContainer}>
          <Text style={s.logTitle}>📋 操作日志</Text>
          {logs.slice(-10).map((log, i) => (
            <Text key={i} style={s.logText}>{log}</Text>
          ))}
        </View>
      )}

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
  logBtn: { backgroundColor: '#666', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  logBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logContainer: { backgroundColor: '#f8f9fa', padding: 12, maxHeight: 200, borderBottomWidth: 1, borderColor: '#eee' },
  logTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  logText: { fontSize: 11, color: '#666', marginVertical: 2, fontFamily: 'monospace' },
  webview: { flex: 1 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadText: { marginTop: 12, color: '#888' },
});
