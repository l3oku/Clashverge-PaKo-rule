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
    // 加载固定模板配置（其中 proxies 中包含了流量等信息）
    const fixedConfig = await loadYaml(FIXED_CONFIG_URL);
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
      // 自定义格式解析（这里生成的名称为默认格式，不含流量信息，仅用于更新连接参数）
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

    // 合并逻辑：用订阅代理中的连接参数更新固定模板的 proxies（保留模板中预设的名称）
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
    // 如果订阅节点比模板多，则追加额外的不重复节点
    if (subs.length > templateProxies.length) {
      const extraSubs = subs.slice(templateProxies.length);
      extraSubs.forEach(subProxy => {
        if (!mergedProxies.some(proxy => proxy.name === subProxy.name)) {
          mergedProxies.push(subProxy);
        }
      });
    }

    // 构造最终输出对象，严格按照你提供的格式：
    const finalConfig = {
      dns: {
        enable: true,
        listen: "0.0.0.0:1053",
        ipv6: true,
        "enhanced-mode": "fake-ip",
        "fake-ip-range": "28.0.0.1/8",
        "fake-ip-filter": ["*", "+.lan"],
        "default-nameserver": ["223.5.5.5", "223.6.6.6"],
        nameserver: [
          "https://223.5.5.5/dns-query#h3=true",
          "https://223.6.6.6/dns-query#h3=true"
        ]
      },
      proxies: mergedProxies,
      "rule-providers": {
        private: {
          url: "https://ghfast.top/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.yaml",
          path: "./ruleset/private.yaml",
          behavior: "domain",
          interval: 86400,
          format: "yaml",
          type: "http"
        },
        rules: [
          "DOMAIN-KEYWORD,vidhub1.cc,DIRECT",
          "DOMAIN,domainname,PROXY",
          "RULE-SET,Spotify_domain,Spotify",
          "RULE-SET,youtube_domain,Youtube",
          "RULE-SET,copilot,AIGC",
          "RULE-SET,claude,AIGC",
          "RULE-SET,bard,AIGC",
          "RULE-SET,openai,AIGC",
          "DOMAIN-SUFFIX,chat.openai.com,AIGC",
          "DOMAIN-SUFFIX,chatgpt.com,AIGC",
          "DOMAIN-SUFFIX,api.openai.com,AIGC"
        ]
      }
    };

    res.set('Content-Type', 'text/yaml');
    // 禁用自动换行（lineWidth: -1）以保留较好格式
    res.send(yaml.dump(finalConfig, { lineWidth: -1 }));
  } catch (error) {
    res.status(500).send(`转换失败：${error.message}`);
  }
});

module.exports = app;
