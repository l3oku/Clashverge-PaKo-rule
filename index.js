const express = require('express');
const axios = require('axios');
const yaml = require('js-yaml');
const app = express();

const FIXED_CONFIG_URL = 'https://raw.githubusercontent.com/6otho/Yaml-PaKo/refs/heads/main/PAKO2-ZIYONG.yaml';

// 工具函数：加载远程 YAML 配置并解析为对象
async function loadYaml(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Clash Verge' }
  });
  return yaml.load(response.data);
}

app.get('/', async (req, res) => {
  const subUrl = req.query.url; // 获取用户传入的订阅链接
  if (!subUrl) {
    return res.status(400).send('请提供订阅链接，例如 ?url=你的订阅地址');
  }
  
  try {
    // 1. 加载固定模板配置（你的分流模板）
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
    
    // 2. 从订阅链接获取原始数据
    const response = await axios.get(subUrl, {
      headers: { 'User-Agent': 'Clash Verge' }
    });
    const rawData = response.data;

    // 3. 尝试 Base64 解码（如果数据经过编码）
    let decodedData;
    try {
      decodedData = Buffer.from(rawData, 'base64').toString('utf-8');
      if (!decodedData.includes('proxies:') && !decodedData.includes('port:') && !decodedData.includes('mixed-port:')) {
        decodedData = rawData;
      }
    } catch (e) {
      decodedData = rawData;
    }
    
    // 4. 根据数据内容判断：如果包含 proxies 或 port 则认为是标准 YAML 配置
    let subConfig = null;
    if (
      decodedData.includes('proxies:') ||
      decodedData.includes('port:') ||
      decodedData.includes('mixed-port:')
    ) {
      subConfig = yaml.load(decodedData);
      if (subConfig && typeof subConfig === 'object' && !Array.isArray(subConfig)) {
        if (subConfig['mixed-port'] !== undefined) {
          subConfig.port = subConfig['mixed-port'];
          delete subConfig['mixed-port'];
        }
      }
    } else {
      // 5. 否则，尝试解析自定义格式（假设每行一个节点，字段以 | 分隔）
      const proxies = decodedData
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split('|');
          if (parts.length < 5) return null;
          const [type, server, port, cipher, password] = parts;
          return {
            name: '', // 预留空名字，后面来填充
            type: type || 'ss',
            server,
            port: parseInt(port),
            cipher: cipher || 'aes-256-gcm',
            password
          };
        })
        .filter(item => item !== null);
      subConfig = { proxies };
    }
    
    // 6. 从订阅链接中提取域名（例如：https://login.djjc.cfd/api/v1/client/subscribe?... 得到 djjc.cfd）
    let domainName = '';
    try {
      const urlObj = new URL(subUrl);
      const hostname = urlObj.hostname; // 比如 login.djjc.cfd
      const parts = hostname.split('.');
      // 取最后两个部分，得到 djjc.cfd
      if (parts.length >= 2) {
        domainName = parts.slice(-2).join('.');
      } else {
        domainName = hostname;
      }
    } catch (e) {
      domainName = 'default';
    }
    
    // 7. 遍历代理列表，如果代理对象中没有 name 或 name 为空（包括空字符串或仅有空格），则用提取的域名赋值
    if (subConfig && subConfig.proxies && Array.isArray(subConfig.proxies)) {
      subConfig.proxies = subConfig.proxies.map(proxy => {
        if (!proxy.name || typeof proxy.name !== 'string' || proxy.name.trim() === '') {
          // 如果有 remark 字段，且不为空也可用 remark 作为名字（这里可以根据需要调整）
          if (proxy.remark && typeof proxy.remark === 'string' && proxy.remark.trim() !== '') {
            proxy.name = proxy.remark;
          } else {
            proxy.name = domainName;
          }
        }
        return proxy;
      });
      
      // 将代理列表注入到固定模板中
      fixedConfig.proxies = subConfig.proxies;
      
      // 同步更新模板中的 proxy-groups，确保代理名称列表正确
      if (fixedConfig['proxy-groups']) {
        fixedConfig['proxy-groups'] = fixedConfig['proxy-groups'].map(group => {
          if (group.proxies && Array.isArray(group.proxies)) {
            return { ...group, proxies: subConfig.proxies.map(p => p.name) };
          }
          return group;
        });
      }
    }
    
    // 8. 输出最终 YAML 配置
    res.set('Content-Type', 'text/yaml');
    res.send(yaml.dump(fixedConfig));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
