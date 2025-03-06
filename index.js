const express = require('express');
const axios = require('axios');
const yaml = require('js-yaml');
const app = express();

const FIXED_CONFIG_URL = 'https://raw.githubusercontent.com/6otho/Yaml-PaKo/refs/heads/main/PAKO.yaml';

async function loadYaml(url) {
  const response = await axios.get(url, { headers: { 'User-Agent': 'Clash Verge' } });
  return yaml.load(response.data);
}

app.get('/', async (req, res) => {
  const subUrl = req.query.url;
  if (!subUrl) return res.status(400).send('请提供订阅链接，例如 ?url=你的订阅地址');
  
  try {
    // 加载模板配置
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
    
    // 获取订阅数据
    const response = await axios.get(subUrl, { headers: { 'User-Agent': 'Clash Verge' } });
    let decodedData = response.data;
    
    // Base64解码处理
    try {
      const tempDecoded = Buffer.from(decodedData, 'base64').toString('utf-8');
      if (tempDecoded.includes('proxies:') || tempDecoded.includes('port:')) {
        decodedData = tempDecoded;
      }
    } catch (e) { /* 忽略解码错误 */ }

    // 解析订阅数据
    let subConfig;
    if (decodedData.includes('proxies:')) {
      subConfig = yaml.load(decodedData);
    } else {
      // 自定义格式解析
      subConfig = {
        proxies: decodedData.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const parts = line.split('|');
            return parts.length >= 5 ? {
              name: `${parts[1]}-${parts[2]}`,
              type: parts[0] || 'ss',
              server: parts[1],
              port: parseInt(parts[2]),
              cipher: parts[3] || 'aes-256-gcm',
              password: parts[4]
            } : null;
          })
          .filter(Boolean)
      };
    }

    // 核心修改部分开始
    if (subConfig?.proxies?.length > 0) {
      // 1. 仅修改第一个代理的连接信息
      if (fixedConfig.proxies?.length > 0) {
        const templateProxy = fixedConfig.proxies[0];
        const subProxy = subConfig.proxies[0];
        
        // 保留模板代理名称，仅更新连接字段
        fixedConfig.proxies[0] = { 
          ...templateProxy,
          server: subProxy.server,
          port: subProxy.port || templateProxy.port,
          password: subProxy.password || templateProxy.password,
          // 以下字段按需添加
          cipher: subProxy.cipher || templateProxy.cipher,
          type: subProxy.type || templateProxy.type
        };
      }

      // 2. 去重处理（根据name字段）
      const seen = new Set();
      fixedConfig.proxies = fixedConfig.proxies.filter(proxy => {
        return !seen.has(proxy.name) && seen.add(proxy.name);
      });

      // 3. 更新PROXY组
      if (fixedConfig['proxy-groups']) {
        fixedConfig['proxy-groups'] = fixedConfig['proxy-groups'].map(group => {
          if (group.name === 'PROXY') {
            // 保留原有名称顺序，实际连接已更新
            return {
              ...group,
              proxies: group.proxies.map((name, index) => 
                index === 0 ? fixedConfig.proxies[0]?.name : name
              ).filter(Boolean)
            };
          }
          return group;
        });
      }
    }
    // 核心修改部分结束

    res.set('Content-Type', 'text/yaml');
    res.send(yaml.dump(fixedConfig));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
