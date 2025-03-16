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
    // 加载模板配置（固定配置中预设了包含流量信息的代理名称）
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
    
    // 确保 proxies 字段存在且为数组
    if (!Array.isArray(fixedConfig.proxies)) {
      fixedConfig.proxies = [];
    }

    // 获取订阅数据
    const response = await axios.get(subUrl, { headers: { 'User-Agent': 'Clash Verge' } });
    let decodedData = response.data;
    
    // Base64 解码处理
    try {
      const tempDecoded = Buffer.from(decodedData, 'base64').toString('utf-8');
      if (tempDecoded.includes('proxies:') || tempDecoded.includes('port:')) {
        decodedData = tempDecoded;
      }
    } catch (e) {}

    // 解析订阅数据
    let subConfig;
    if (decodedData.includes('proxies:')) {
      subConfig = yaml.load(decodedData);
    } else {
      // 自定义格式解析：此处生成的节点名称可能不包含流量等信息
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
              password: parts[4],
              udp: true
            } : null;
          })
          .filter(Boolean)
      };
    }

    // 核心逻辑：用订阅代理更新固定模板的连接信息，但保留模板中包含流量等有用信息的名称
    if (subConfig?.proxies?.length > 0) {
      const templateProxies = fixedConfig.proxies || [];
      const subs = subConfig.proxies;
      
      // 1. 更新模板中已有节点的连接参数（按顺序匹配），名称不变
      const updatedProxies = templateProxies.map((tplProxy, index) => {
        if (index < subs.length) {
          const subProxy = subs[index];
          return {
            ...tplProxy,
            server: subProxy.server,
            port: subProxy.port || tplProxy.port,
            password: subProxy.password || tplProxy.password,
            cipher: subProxy.cipher || tplProxy.cipher,
            type: subProxy.type || tplProxy.type,
            udp: (subProxy.udp !== undefined) ? subProxy.udp : tplProxy.udp
          };
        }
        return tplProxy;
      });
      
      // 2. 如果订阅代理数量多于模板数量，则将多余的订阅节点追加进来（前提是不和现有节点名称重复）
      if (subs.length > templateProxies.length) {
        const extraSubs = subs.slice(templateProxies.length);
        extraSubs.forEach(subProxy => {
          if (!updatedProxies.some(proxy => proxy.name === subProxy.name)) {
            updatedProxies.push(subProxy);
          }
        });
      }
      
      fixedConfig.proxies = updatedProxies;

      // 3. 更新 PROXY 组，确保组内的代理名称存在于更新后的代理列表中
      if (Array.isArray(fixedConfig['proxy-groups'])) {
        fixedConfig['proxy-groups'] = fixedConfig['proxy-groups'].map(group => {
          if (group.name === 'PROXY' && Array.isArray(group.proxies)) {
            return {
              ...group,
              proxies: group.proxies.filter(name => 
                fixedConfig.proxies.some(p => p.name === name)
              )
            };
          }
          return group;
        });
      }
    }

    res.set('Content-Type', 'text/yaml');
    res.send(yaml.dump(fixedConfig));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
