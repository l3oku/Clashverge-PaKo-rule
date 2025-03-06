const express = require('express');
const axios = require('axios');
const yaml = require('js-yaml');
const app = express();

const FIXED_CONFIG_URL = 'https://raw.githubusercontent.com/6otho/Yaml-PaKo/refs/heads/main/PAKO.yaml';

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
    // 1. 加载你的固定 YAML 配置作为模板
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
    
    // 2. 从订阅链接获取原始数据
    const response = await axios.get(subUrl, {
      headers: { 'User-Agent': 'Clash Verge' }
    });
    const rawData = response.data;

    // 3. 尝试 Base64 解码（如果传入的数据经过编码）
    let decodedData;
    try {
      decodedData = Buffer.from(rawData, 'base64').toString('utf-8');
      // 如果解码后数据中不含关键字，则认为原始数据就是明文
      if (!decodedData.includes('proxies:') && !decodedData.includes('port:') && !decodedData.includes('mixed-port:')) {
        decodedData = rawData;
      }
    } catch (e) {
      decodedData = rawData;
    }
    
    // 4. 根据数据内容判断：如果包含 proxies 或 port，则认为是标准 YAML 配置
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
      // 5. 如果不符合 YAML 格式，则尝试解析为自定义格式（假设每行一个节点，字段用 | 分隔）
      const proxies = decodedData
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split('|');
          if (parts.length < 5) return null;
          const [type, server, port, cipher, password] = parts;
          return {
            name: `${server}-${port}`,
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
    
// 修改后的部分（步骤6）
if (subConfig && subConfig.proxies && subConfig.proxies.length > 0) {
  // 完全替换模板中的proxies
  fixedConfig.proxies = subConfig.proxies;

  // 去重处理：确保代理名称唯一（保留最后一个出现的项）
  const seen = new Map();
  fixedConfig.proxies = fixedConfig.proxies.reverse().filter(proxy => {
    if (!seen.has(proxy.name)) {
      seen.set(proxy.name, true);
      return true;
    }
    return false;
  }).reverse(); // 恢复原始顺序

  // 更新PROXY组的代理名称
  if (fixedConfig['proxy-groups']) {
    fixedConfig['proxy-groups'] = fixedConfig['proxy-groups'].map(group => {
      if (group.name === 'PROXY' && Array.isArray(group.proxies)) {
        return { ...group, proxies: fixedConfig.proxies.map(p => p.name) };
      }
      return group;
    });
  }
}
    
    // 7. 输出最终的 YAML 配置，格式即为你固定的 PAKO.yaml 模板
    res.set('Content-Type', 'text/yaml');
    res.send(yaml.dump(fixedConfig));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
