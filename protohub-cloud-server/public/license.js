/**
 * ProtoHub 离线加密授权与云端黑名单秒封禁核心引擎
 * 零服务器成本 · 终身防伪 · 支持退款远程一键作废
 */
(function(global) {
  const PROTOHUB_SECRET_SALT = "PROTOHUB_SECURE_SALT_2026_V1_SECRET_KEY_983749";
  const DEFAULT_BLACKLIST_URLS = [
    "https://raw.githubusercontent.com/tang11012003/bm_one/gh-pages/blacklist.json",
    "https://tang11012003.github.io/bm_one/blacklist.json",
    "https://raw.gitmirror.com/tang11012003/bm_one/gh-pages/blacklist.json"
  ];
  const DEFAULT_BLACKLIST_URL = DEFAULT_BLACKLIST_URLS[0];

  function simpleHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }

  function computeLicenseSignature(payload) {
    const raw = `${payload}_${PROTOHUB_SECRET_SALT}_SAFE`;
    const part1 = simpleHash(raw);
    const part2 = simpleHash(`${PROTOHUB_SECRET_SALT}_${part1}_${payload}`);
    return `${part1.slice(0, 4)}${part2.slice(0, 4)}`;
  }

  function generateLicenseKey(daysOrDate, plan = 'PRO') {
    let expireStr = '';
    let expDate = new Date();
    if (typeof daysOrDate === 'number') {
      expDate.setDate(expDate.getDate() + daysOrDate);
      const y = expDate.getFullYear();
      const m = String(expDate.getMonth() + 1).padStart(2, '0');
      const d = String(expDate.getDate()).padStart(2, '0');
      expireStr = `${y}${m}${d}`;
    } else if (typeof daysOrDate === 'string' && /^\d{8}$/.test(daysOrDate)) {
      expireStr = daysOrDate;
      const y = parseInt(expireStr.slice(0, 4));
      const m = parseInt(expireStr.slice(4, 6)) - 1;
      const d = parseInt(expireStr.slice(6, 8));
      expDate = new Date(y, m, d, 23, 59, 59);
    } else {
      expireStr = '99991231';
      expDate = new Date(9999, 11, 31);
    }

    const cleanPlan = (plan || 'PRO').toUpperCase();
    const payload = `${cleanPlan}_${expireStr}`;
    const sig = computeLicenseSignature(payload);
    return `PH-${cleanPlan}-${expireStr}-${sig}`;
  }

  function getLocalRevokedList() {
    try {
      return JSON.parse(localStorage.getItem('PROTOHUB_REVOKED_KEYS_CACHE_V1') || '[]');
    } catch (e) {
      return [];
    }
  }

  function verifyLicenseKey(licenseKey) {
    if (!licenseKey || typeof licenseKey !== 'string') {
      return { valid: false, error: '请输入授权卡密' };
    }
    const clean = licenseKey.trim().toUpperCase().replace(/\s+/g, '');
    const parts = clean.split('-');
    if (parts.length !== 4 || parts[0] !== 'PH') {
      return { valid: false, error: '卡密格式无效，格式应如: PH-PRO-20261004-XXXXXXXX' };
    }

    // 1. 本地已同步的黑名单/吊销卡密检查
    const revokedList = getLocalRevokedList();
    if (revokedList.includes(clean)) {
      return {
        valid: false,
        isRevoked: true,
        error: '该卡密已因退款或注销被管理员远程收回作废，无法继续使用！'
      };
    }

    const [_, plan, expireStr, signature] = parts;
    if (!/^\d{8}$/.test(expireStr)) {
      return { valid: false, error: '卡密到期时间格式错误' };
    }

    const payload = `${plan}_${expireStr}`;
    const expectedSig = computeLicenseSignature(payload);
    if (signature !== expectedSig) {
      return { valid: false, error: '卡密校验失败，防伪签名不匹配或已损坏' };
    }

    const year = parseInt(expireStr.slice(0, 4), 10);
    const month = parseInt(expireStr.slice(4, 6), 10) - 1;
    const day = parseInt(expireStr.slice(6, 8), 10);
    const expireDate = new Date(year, month, day, 23, 59, 59, 999);

    const now = new Date();
    const diffMs = expireDate.getTime() - now.getTime();
    const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const isExpired = remainingDays < 0;
    const isPermanent = year >= 9990;

    return {
      valid: !isExpired,
      isExpired,
      isPermanent,
      plan,
      expireDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      remainingDays: isPermanent ? 99999 : Math.max(0, remainingDays),
      key: clean
    };
  }

  const CLOUD_BUCKET = "BwPSmS5CB97TBWf3tTRcBv";

  function getDeviceId() {
    let id = localStorage.getItem('PROTOHUB_DEVICE_ID_V1');
    if (!id) {
      id = 'WIN-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-' + Date.now().toString(36).toUpperCase().slice(-3);
      localStorage.setItem('PROTOHUB_DEVICE_ID_V1', id);
    }
    return id;
  }

  function getCleanKeyName(key) {
    return String(key || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }

  class LicenseManager {
    constructor() {
      this.STORAGE_KEY = 'PROTOHUB_USER_LICENSE_KEY_V1';
      this.TIME_KEY = 'PROTOHUB_LAST_SEEN_TIME_V1';
      this.BLACKLIST_CACHE_KEY = 'PROTOHUB_REVOKED_KEYS_CACHE_V1';
      this.currentLicense = null;
      this.heartbeatTimer = null;
    }

    init() {
      const savedKey = localStorage.getItem(this.STORAGE_KEY);
      if (savedKey) {
        this.currentLicense = verifyLicenseKey(savedKey);
      } else {
        this.currentLicense = { valid: false, isExpired: true, unactivated: true };
      }
      this.checkTimeRollback();
      
      // 启动时静默上报心跳 + 检查云端封禁状态
      if (this.currentLicense && this.currentLicense.valid) {
        this.sendHeartbeat(this.currentLicense.key);
      }
      this.syncRemoteBlacklist();

      // 每 5 分钟定时上报心跳与状态同步
      if (!this.heartbeatTimer) {
        this.heartbeatTimer = setInterval(() => {
          const key = localStorage.getItem(this.STORAGE_KEY);
          if (key) this.sendHeartbeat(key);
        }, 5 * 60 * 1000);
      }

      return this.currentLicense;
    }

    checkTimeRollback() {
      const now = Date.now();
      const lastSeen = parseInt(localStorage.getItem(this.TIME_KEY) || '0', 10);
      if (lastSeen > now + 3600000) {
        console.warn('检测到系统时钟异常倒拨');
      }
      localStorage.setItem(this.TIME_KEY, String(now));
    }

    activate(key) {
      const res = verifyLicenseKey(key);
      if (res.valid) {
        localStorage.setItem(this.STORAGE_KEY, res.key);
        this.currentLicense = res;
        this.sendHeartbeat(res.key);
      }
      return res;
    }

    clear() {
      localStorage.removeItem(this.STORAGE_KEY);
      this.currentLicense = { valid: false, isExpired: true, unactivated: true };
    }

    getStatus() {
      return this.currentLicense || this.init();
    }

    /**
     * 实时心跳上报与使用统计 (同时获取云端封禁指令)
     */
    async sendHeartbeat(key) {
      if (!key) return;
      const cleanKey = getCleanKeyName(key);
      const deviceId = getDeviceId();
      const nowStr = new Date().toLocaleString();

      try {
        const url = `https://kvdb.io/${CLOUD_BUCKET}/hb_${cleanKey}`;
        
        // 1. 读取云端当前状态
        let currentRecord = null;
        try {
          const res = await fetch(url + `?_t=${Date.now()}`, { cache: 'no-cache' });
          if (res.ok) {
            currentRecord = await res.json();
          }
        } catch (e) {}

        // 2. 检查云端是否已被管理员标记为封禁 (isBanned === true)
        if (currentRecord && currentRecord.isBanned) {
          console.warn('⚠️ 收到云端强制封禁指令！卡密已作废。');
          this.clear();
          this.currentLicense = {
            valid: false,
            isRevoked: true,
            revokedReason: currentRecord.banReason || '该授权卡密已被管理员在云端远程注销作废，无法继续使用！'
          };
          if (global.app && typeof global.app.onLicenseRevoked === 'function') {
            global.app.onLicenseRevoked(this.currentLicense.revokedReason);
          }
          return { isBanned: true };
        }

        // 3. 更新活跃数据
        const payload = {
          key: key,
          deviceId: deviceId,
          launchCount: ((currentRecord && currentRecord.launchCount) || 0) + 1,
          firstSeen: (currentRecord && currentRecord.firstSeen) || nowStr,
          lastSeen: nowStr,
          lastSeenTimestamp: Date.now(),
          isBanned: false,
          platform: 'Windows Desktop (ProtoHub)',
          version: '1.0.0'
        };

        // 4. 写回云端
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        return { success: true, record: payload };
      } catch (err) {
        // 离线时不影响本地正常运行
        return { success: false };
      }
    }

    /**
     * 云端黑名单静默同步与实时封禁
     */
    async syncRemoteBlacklist(customUrl) {
      const urls = customUrl ? [customUrl] : (
        localStorage.getItem('PROTOHUB_CUSTOM_BLACKLIST_URL') 
          ? [localStorage.getItem('PROTOHUB_CUSTOM_BLACKLIST_URL')]
          : DEFAULT_BLACKLIST_URLS
      );

      for (const url of urls) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(`${url}?_t=${Date.now()}`, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' }
          });
          clearTimeout(timer);

          if (res.ok) {
            const data = await res.json();
            const revokedKeys = Array.isArray(data.revokedKeys) ? data.revokedKeys.map(k => String(k).trim().toUpperCase()) : [];
            localStorage.setItem(this.BLACKLIST_CACHE_KEY, JSON.stringify(revokedKeys));

            // 检查当前激活的卡密是否处于黑名单中
            const currentKey = localStorage.getItem(this.STORAGE_KEY);
            if (currentKey && revokedKeys.includes(currentKey.trim().toUpperCase())) {
              console.warn('⚠️ 当前卡密已被云端列入封禁黑名单，立即终止授权！');
              this.clear();
              this.currentLicense = {
                valid: false,
                isRevoked: true,
                revokedReason: data.notice || '该授权卡密已因退款被管理员远程注销，已终止服务。'
              };
              if (global.app && typeof global.app.onLicenseRevoked === 'function') {
                global.app.onLicenseRevoked(this.currentLicense.revokedReason);
              }
              return { hasRevoked: true, notice: this.currentLicense.revokedReason };
            }
            return { success: true, count: revokedKeys.length };
          }
        } catch (err) {
          // 尝试下一个节点
        }
      }
      return { success: false };
    }
  }

  const instance = new LicenseManager();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      LicenseManager,
      licenseManager: instance,
      generateLicenseKey,
      verifyLicenseKey,
      CLOUD_BUCKET,
      DEFAULT_BLACKLIST_URL
    };
  } else {
    global.LicenseManager = LicenseManager;
    global.licenseManager = instance;
    global.generateLicenseKey = generateLicenseKey;
    global.verifyLicenseKey = verifyLicenseKey;
    global.CLOUD_BUCKET = CLOUD_BUCKET;
    global.DEFAULT_BLACKLIST_URL = DEFAULT_BLACKLIST_URL;
  }
})(typeof window !== 'undefined' ? window : global);
