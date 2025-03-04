const express = require('express');
const axios = require('axios');
const yaml = require('js-yaml');
const app = express();

const FIXED_CONFIG_URL = 'https://raw.githubusercontent.com/6otho/Yaml-PaKo/refs/heads/main/PAKO2-ZIYONG.yaml';

async function loadYaml(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Clash Verge' }
  });
  return yaml.load(response.data);
}

app.get('/', async (req, res) => {
  const subUrl = req.query.url;
  if (!subUrl) {
    return res.status(400).send('请提供订阅链接，例如 ?url=你的订阅地址');
  }

  try {
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
    const response = await axios.get(subUrl, {
      headers: { 'User-Agent': 'Clash Verge' },
      timeout: 10000
    });
    const rawData = response.data;

    // 解码处理优化
    let decodedData = rawData;
    try {
      const bufferData = Buffer.from(rawData, 'base64').toString('utf-8');
      if (bufferData.match(/^(proxies:|port:|mixed-port:)/m)) {
        decodedData = bufferData;
      }
    } catch (e) { /* 保持原始数据 */ }

    let subConfig = {};
    if (decodedData.includes('proxies:')) {
      subConfig = yaml.load(decodedData) || {};
    } else {
      // 增强自定义格式解析
      subConfig.proxies = decodedData
        .split('\n')
        .map(line => {
          const parts = line.trim().split('|');
          if (parts.length < 5) return null;
          
          const [type, server, port, cipher, password] = parts;
          const numPort = parseInt(port);
          
          if (!server || isNaN(numPort)) return null;

          return {
            name: 'Default-sub', // 直接在此处设置默认名称
            type: type || 'ss',
            server: server.trim(),
            port: numPort,
            cipher: (cipher || 'aes-256-gcm').trim(),
            password: password.trim()
          };
        })
        .filter(Boolean);
    }

    // 强制覆盖所有代理名称
    if (subConfig.proxies?.length) {
      subConfig.proxies = subConfig.proxies.map(p => ({
        ...p,
        name: 'Default-sub' // 确保名称强制覆盖
      }));

      fixedConfig.proxies = subConfig.proxies;

      // 更新代理组
      if (fixedConfig['proxy-groups']) {
        fixedConfig['proxy-groups'] = fixedConfig['proxy-groups'].map(group => ({
          ...group,
          proxies: group.proxies?.includes('Default-sub') 
            ? ['Default-sub']  // 如果原组包含任意代理，则替换为单个默认名称
            : group.proxies    // 否则保持原样
        }));
      }
    }

    res
      .set('Content-Type', 'text/yaml')
      .send(yaml.dump(fixedConfig));

  } catch (error) {
    console.error(`处理失败: ${error.message}`);
    res.status(500).send(`配置转换失败: ${error.message}`);
  }
});

module.exports = app;
