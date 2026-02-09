import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';

export default function BookingScreen() {
  const { url, platform, flightNo, preference, targetPrice } = useLocalSearchParams<{ 
    url: string; 
    platform: string; 
    flightNo: string;
    preference: string;
    targetPrice: string;
  }>();
  const webviewRef = useRef<WebView>(null);
  const [status, setStatus] = useState('正在打开页面...');
  const [logs, setLogs] = useState<string[]>(['📱 启动自动订票流程...']);
  const [passenger, setPassenger] = useState<any>(null);
  const [currentUrl, setCurrentUrl] = useState(url || '');

  const addLog = (msg: string) => {
    const logEntry = `${new Date().toLocaleTimeString()} ${msg}`;
    setLogs(prev => {
      const newLogs = [...prev, logEntry];
      // 保存到AsyncStorage
      AsyncStorage.setItem('booking_logs', JSON.stringify(newLogs.slice(-100))); // 只保存最近100条
      return newLogs;
    });
    setStatus(msg);
  };

  useEffect(() => {
    addLog('🔍 正在读取乘客信息...');
    
    // 读取保存的日志
    AsyncStorage.getItem('booking_logs').then(savedLogs => {
      if (savedLogs) {
        try {
          const parsed = JSON.parse(savedLogs);
          setLogs(prev => [...parsed, ...prev]);
        } catch (e) {}
      }
    });
    
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

  // 自动订票脚本（完整版）
  const getFillScript = () => {
    if (!passenger) return '';
    
    return `
      (function() {
        const passenger = ${JSON.stringify(passenger)};
        const preference = '${preference || 'cheapest'}';
        const targetPrice = '${targetPrice || ''}';
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
          sendLog('  尝试匹配 ' + fieldName + '...');
          for (let i = 0; i < selectors.length; i++) {
            const els = document.querySelectorAll(selectors[i]);
            sendLog('  选择器 ' + selectors[i] + ' 找到 ' + els.length + ' 个元素');
            for (let j = 0; j < els.length; j++) {
              const el = els[j];
              if (el && el.offsetParent !== null && !el.disabled && !usedInputs.has(el)) {
                // 尝试填写
                const filled = fillInput(el, expectedValue);
                if (!filled) continue;
                
                // 等待一下让值稳定
                setTimeout(function() {}, 200);
                
                // 严格验证：值必须完全匹配
                const currentValue = el.value || '';
                sendLog('  验证: 期望=' + expectedValue + ', 实际=' + currentValue);
                
                if (currentValue === expectedValue) {
                  usedInputs.add(el);
                  sendLog('✓ ' + fieldName + ': 填写成功并验证通过');
                  return { el: el, success: true };
                } else {
                  sendLog('✗ 验证失败，继续尝试下一个');
                  el.value = ''; // 清空错误的值
                }
              }
            }
          }
          sendLog('✗ ' + fieldName + ': 所有选择器都未匹配');
          return { el: null, success: false };
        }
        
        function sendStatus(msg) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'status', message: msg }));
        }
        
        function sendLog(msg) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
        }
        
        // 发送DOM结构供调试
        function sendDOMInfo() {
          const inputs = document.querySelectorAll('input');
          const inputInfo = [];
          for (let i = 0; i < inputs.length; i++) {
            const inp = inputs[i];
            if (inp.offsetParent !== null) { // 只要可见的
              inputInfo.push({
                type: inp.type,
                placeholder: inp.placeholder,
                name: inp.name,
                id: inp.id,
                value: inp.value,
                className: inp.className
              });
            }
          }
          sendLog('📊 页面共有 ' + inputInfo.length + ' 个可见input');
          window.ReactNativeWebView.postMessage(JSON.stringify({ 
            type: 'dom_info', 
            inputs: inputInfo,
            url: window.location.href,
            html: document.body.innerHTML.substring(0, 5000) // 只发前5000字符
          }));
        }
        
        // 自动选择套餐（根据偏好）
        function autoSelectPackage() {
          sendLog('🎯 根据偏好"' + preference + '"自动选择套餐...');
          
          // 找到所有可能的套餐/预订按钮
          const buttons = document.querySelectorAll('button, a, div[class*="book"], div[class*="btn"], div[class*="order"]');
          sendLog('找到 ' + buttons.length + ' 个按钮');
          
          // 找包含"预订"、"订票"、"立即预订"等文字的按钮
          const bookButtons = [];
          for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const text = btn.innerText || btn.textContent || '';
            if (text.includes('预订') || text.includes('订票') || text.includes('立即') || text.includes('选择')) {
              bookButtons.push(btn);
            }
          }
          
          sendLog('找到 ' + bookButtons.length + ' 个预订按钮');
          
          if (bookButtons.length > 0) {
            // 如果是"最便宜"偏好，找价格最低的按钮附近的
            if (preference === 'cheapest') {
              // 简单策略：点第一个预订按钮（通常是最便宜的）
              sendLog('✓ 点击第一个预订按钮（通常是最便宜的）');
              bookButtons[0].click();
              return true;
            } else {
              // 其他偏好也点第一个
              sendLog('✓ 点击第一个预订按钮');
              bookButtons[0].click();
              return true;
            }
          }
          
          sendLog('⚠️ 未找到预订按钮');
          return false;
        }
        
        // 自动点击"添加乘机人"按钮
        function autoClickAddPassenger() {
          sendLog('🔍 查找"添加乘机人"按钮...');
          
          const buttonTexts = ['添加乘机人', '新增乘机人', '添加旅客', '新增旅客', '添加乘客', '新增乘客', '+更多乘机人'];
          
          for (let i = 0; i < buttonTexts.length; i++) {
            const buttons = document.querySelectorAll('button, a, div[class*="button"], div[class*="btn"]');
            for (let j = 0; j < buttons.length; j++) {
              const btn = buttons[j];
              const text = btn.innerText || btn.textContent || '';
              if (text.includes(buttonTexts[i])) {
                sendLog('✓ 找到"' + buttonTexts[i] + '"按钮，自动点击');
                btn.click();
                return true;
              }
            }
          }
          
          sendLog('ℹ️ 未找到"添加乘机人"按钮');
          return false;
        }
        
        function tryFill() {
          sendLog('🔍 开始分析页面结构...');
          sendStatus('正在分析页面...');
          
          // 步骤1：尝试选择套餐
          sendLog('步骤1: 尝试自动选择套餐...');
          const selectedPackage = autoSelectPackage();
          if (selectedPackage) {
            sendLog('⏳ 已点击套餐，等待页面跳转...');
            setTimeout(function() {
              tryFill(); // 递归调用，继续下一步
            }, 3000);
            return 0;
          }
          
          // 步骤2：尝试点击"添加乘机人"
          sendLog('步骤2: 尝试点击"添加乘机人"...');
          const clickedAdd = autoClickAddPassenger();
          if (clickedAdd) {
            sendLog('⏳ 已点击"添加乘机人"，等待表单弹出...');
            // 等待1秒让表单弹出
            setTimeout(function() {
              fillForm();
            }, 1000);
            return 0;
          }
          
          // 步骤3：直接填表
          sendLog('步骤3: 直接填写表单...');
          fillForm();
        }
        
        function fillForm() {
          sendLog('📝 开始填写表单...');
          
          // 先发送DOM信息供调试
          sendDOMInfo();
          
          const results = [];
          
          // ⚠️ 重要：必须先填姓名，再填其他字段！
          // 填写姓名（改进：更宽松的匹配，并且排第一个）
          sendLog('📝 [1/3] 正在填写姓名...');
          const nameResult = findInput([
            'input[placeholder*="姓名"]',
            'input[placeholder*="名字"]',
            'input[name*="name" i]',
            'input[id*="name" i]',
            'input[placeholder*="乘机人"]',
            'input[placeholder*="旅客"]',
            'input[placeholder*="乘客"]',
            'input[placeholder*="联系人"]',
            'input[name*="passenger" i]',
            // 最后兜底：找第一个text类型的input（排除证件和手机）
            'input[type="text"]:not([placeholder*="证件"]):not([placeholder*="身份证"]):not([placeholder*="手机"]):not([placeholder*="电话"]):not([placeholder*="号码"])',
          ], passenger.name, '姓名');
          
          if (nameResult.success) {
            const displayName = passenger.name.length > 2 ? passenger.name.substring(0, 2) + '...' : passenger.name;
            results.push('✓ 姓名: ' + displayName);
            sendLog('✓ 姓名已填写');
          } else {
            sendLog('✗ 姓名字段未找到');
          }
          
          // 填写身份证（必须在姓名之后）
          sendLog('📝 [2/3] 正在填写身份证...');
          const idResult = findInput([
            'input[placeholder*="身份证"]',
            'input[placeholder*="证件号码"]',
            'input[placeholder*="证件号"]',
            'input[placeholder*="证件"]',
            'input[name*="idno" i]',
            'input[name*="card" i]',
            'input[name*="credential" i]',
            'input[id*="idcard" i]',
            'input[id*="certno" i]',
          ], passenger.idNumber, '身份证');
          
          if (idResult.success) {
            const displayId = passenger.idNumber.length > 4 ? passenger.idNumber.substring(0, 4) + '...' : passenger.idNumber;
            results.push('✓ 身份证: ' + displayId);
            sendLog('✓ 身份证已填写');
          } else {
            sendLog('✗ 身份证字段未找到');
          }
          
          // 填写手机（必须在最后）
          sendLog('📝 [3/3] 正在填写手机号...');
          const phoneResult = findInput([
            'input[placeholder*="手机"]',
            'input[placeholder*="联系手机"]',
            'input[placeholder*="电话"]',
            'input[type="tel"]',
            'input[name*="phone" i]',
            'input[name*="mobile" i]',
            'input[id*="phone" i]',
            'input[id*="mobile" i]',
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
            return results.length;
          } else {
            sendLog('⚠️ 未找到表单，可能还在搜索页');
            sendStatus('未找到表单，可能还在搜索页');
            return 0;
          }
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
      } else if (data.type === 'dom_info') {
        // 保存DOM信息供调试
        addLog('📊 收到DOM信息，共' + data.inputs.length + '个input');
        AsyncStorage.setItem('debug_dom_info', JSON.stringify(data));
        
        // 详细显示每个input
        data.inputs.forEach((inp: any, i: number) => {
          addLog(`  Input[${i}]: type=${inp.type}, placeholder="${inp.placeholder}", name="${inp.name}", id="${inp.id}"`);
        });
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

  const clearLogs = () => {
    setLogs(['📱 日志已清除']);
    AsyncStorage.removeItem('booking_logs');
  };

  const exportLogs = () => {
    const logText = logs.join('\n');
    addLog('📋 日志内容：\n' + logText);
  };

  const viewDOMInfo = async () => {
    const domInfo = await AsyncStorage.getItem('debug_dom_info');
    if (domInfo) {
      const data = JSON.parse(domInfo);
      addLog('=== DOM调试信息 ===');
      addLog('URL: ' + data.url);
      addLog('共' + data.inputs.length + '个可见input:');
      data.inputs.forEach((inp: any, i: number) => {
        addLog(`[${i}] type=${inp.type}, placeholder="${inp.placeholder}", name="${inp.name}", id="${inp.id}", value="${inp.value}"`);
      });
      setShowLogs(true);
    } else {
      addLog('⚠️ 暂无DOM信息，请先进入填表页');
    }
  };

  const [showLogs, setShowLogs] = useState(false);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.statusBar}>
        <Text style={s.statusText} numberOfLines={1}>{status}</Text>
        <TouchableOpacity style={s.fillBtn} onPress={manualFill}>
          <Text style={s.fillBtnText}>填表</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.debugBtn} onPress={viewDOMInfo}>
          <Text style={s.debugBtnText}>DOM</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.logBtn} onPress={() => setShowLogs(!showLogs)}>
          <Text style={s.logBtnText}>{showLogs ? '隐藏' : '日志'}</Text>
        </TouchableOpacity>
      </View>

      {showLogs && (
        <View style={s.logContainer}>
          <View style={s.logHeader}>
            <Text style={s.logTitle}>📋 操作日志（共{logs.length}条）</Text>
            <TouchableOpacity style={s.clearBtn} onPress={clearLogs}>
              <Text style={s.clearBtnText}>清除</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.logScroll}>
            {logs.map((log, i) => (
              <Text key={i} style={s.logText}>{log}</Text>
            ))}
          </ScrollView>
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
  debugBtn: { backgroundColor: '#ff9800', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  debugBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logBtn: { backgroundColor: '#666', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  logBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logContainer: { backgroundColor: '#f8f9fa', padding: 12, maxHeight: 300, borderBottomWidth: 1, borderColor: '#eee' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  logTitle: { fontSize: 14, fontWeight: '600' },
  clearBtn: { backgroundColor: '#ea4335', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  clearBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  logScroll: { maxHeight: 250 },
  logText: { fontSize: 11, color: '#666', marginVertical: 2, fontFamily: 'monospace' },
  webview: { flex: 1 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  loadText: { marginTop: 12, color: '#888' },
});
