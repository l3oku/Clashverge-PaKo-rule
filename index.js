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

    // ========= 新增代码开始 =========
    // 分离出流量信息节点和普通节点
    let trafficProxies = [];
    let normalProxies = [];
    const trafficRegex = /^(剩余流量：|距离下次重置剩余：|套餐到期：)/;
    if (subConfig && Array.isArray(subConfig.proxies)) {
      for (const proxy of subConfig.proxies) {
        if (proxy.name && trafficRegex.test(proxy.name)) {
          // 保留原始流量信息节点
          trafficProxies.push(proxy);
        } else {
          normalProxies.push(proxy);
        }
      }
      // 用普通节点更新订阅配置
      subConfig.proxies = normalProxies;
    }
    // ========= 新增代码结束 =========

    // ========= 合并逻辑 =========
    // 从模板中获取已有代理节点
    const templateProxies = [...fixedConfig.proxies];

    // 如果模板有节点且订阅普通节点存在，则用订阅中的第一个普通节点更新模板第一个节点
    if (templateProxies.length > 0 && normalProxies.length > 0) {
      const subProxy = normalProxies[0];
      templateProxies[0] = {
        ...templateProxies[0],  // 保留模板的名称和默认配置
        server: subProxy.server,
        port: subProxy.port || templateProxies[0].port,
        password: subProxy.password || templateProxies[0].password,
        cipher: subProxy.cipher || templateProxies[0].cipher,
        type: subProxy.type || templateProxies[0].type
      };
    }

    // 合并后的代理列表：先放流量信息节点，再放模板节点，再放订阅普通节点
    let mergedProxies = [...trafficProxies, ...templateProxies, ...normalProxies];

    // 根据名称去重（保留第一次出现的节点）
    const seen = new Map();
    fixedConfig.proxies = mergedProxies.filter(proxy => {
      if (!proxy?.name) return false;
      if (!seen.has(proxy.name)) {
        seen.set(proxy.name, true);
        return true;
      }
      return false;
    });

    // 更新 PROXY 组（不做修改，直接过滤掉不存在的节点名称）
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
    // ========= 合并逻辑结束 =========

    res.set('Content-Type', 'text/yaml');
    res.send(yaml.dump(fixedConfig));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
