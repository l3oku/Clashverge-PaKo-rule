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
    
    // 确保proxies字段存在且为数组
    if (!Array.isArray(fixedConfig.proxies)) {
      fixedConfig.proxies = [];
    }

    // 获取订阅数据
    const response = await axios.get(subUrl, { headers: { 'User-Agent': 'Clash Verge' } });
    let decodedData = response.data;
    
    // Base64解码处理
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
      // 自定义格式解析（注意：此处生成的代理名称仅为默认格式，不包含流量信息）
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

    // 核心逻辑：使用订阅代理更新模板代理的连接信息（保留模板代理名称，即流量信息），避免重复
    if (subConfig?.proxies?.length > 0) {
      const templateProxies = fixedConfig.proxies || [];
      const subs = subConfig.proxies;
      
      // 更新模板中每个代理的连接参数，保留模板中的名称
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
            udp: subProxy.udp !== undefined ? subProxy.udp : tplProxy.udp
          };
        }
        return tplProxy;
      });
      
      // 如果订阅代理数量多于模板代理数量，可选择是否添加额外节点，
      // 为确保流量信息统一，这里只保留模板内预设的节点，避免新增没有流量信息的节点。
      fixedConfig.proxies = updatedProxies;

      // 更新PROXY组（保持组中代理名称与更新后的代理匹配）
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
