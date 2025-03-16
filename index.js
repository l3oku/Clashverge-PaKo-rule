const express = require('express');
const axios = require('axios');
const yaml = require('js-yaml');
const app = express();

// 固定配置文件 URL（包含完整的分流规则、代理组、规则提供者等）
const FIXED_CONFIG_URL = 'https://raw.githubusercontent.com/6otho/Yaml-PaKo/refs/heads/main/PAKO.yaml';

async function loadYaml(url) {
  const response = await axios.get(url, { headers: { 'User-Agent': 'Clash Verge' } });
  return yaml.load(response.data);
}

app.get('/', async (req, res) => {
  const subUrl = req.query.url;
  if (!subUrl) return res.status(400).send('请提供订阅链接，例如 ?url=你的订阅地址');
  
  try {
    // 1. 加载固定模板配置（其中包含完整的分流规则、代理组、规则提供者等）
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
    if (!Array.isArray(fixedConfig.proxies)) {
      fixedConfig.proxies = [];
    }

    // 2. 获取订阅数据
    const response = await axios.get(subUrl, { headers: { 'User-Agent': 'Clash Verge' } });
    let decodedData = response.data;
    
    // Base64 解码处理（如果返回数据经过 Base64 编码，则解码）
    try {
      const tempDecoded = Buffer.from(decodedData, 'base64').toString('utf-8');
      if (tempDecoded.includes('proxies:') || tempDecoded.includes('port:')) {
        decodedData = tempDecoded;
      }
    } catch (e) {
      // 忽略解码失败
    }
    
    // 3. 解析订阅数据（支持 YAML 格式或自定义格式）
    let subConfig;
    if (decodedData.includes('proxies:')) {
      subConfig = yaml.load(decodedData);
    } else {
      // 自定义格式解析：生成的节点名称仅作为默认，不包含流量等描述
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
    
    // 4. 合并逻辑：仅更新固定配置中 proxies 数组的连接参数（server、port、password、cipher、type、udp）
    //    保留固定配置中原有的代理名称（这些名称包含了流量、重置、到期等信息）
    const templateProxies = fixedConfig.proxies;
    const subs = subConfig.proxies || [];
    let mergedProxies = templateProxies.map((tplProxy, index) => {
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
    // 如果订阅代理数量超过模板数量，则追加额外的节点（前提是不重复名称）
    if (subs.length > templateProxies.length) {
      const extraSubs = subs.slice(templateProxies.length);
      extraSubs.forEach(subProxy => {
        if (!mergedProxies.some(proxy => proxy.name === subProxy.name)) {
          mergedProxies.push(subProxy);
        }
      });
    }
    fixedConfig.proxies = mergedProxies;
    
    // 5. 输出最终配置，保留固定配置中原有的所有分流规则、代理组、规则提供者等信息
    res.set('Content-Type', 'text/yaml');
    res.send(yaml.dump(fixedConfig, { lineWidth: -1 }));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
