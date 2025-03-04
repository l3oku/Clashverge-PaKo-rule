const express = require('express');
const axios = require('axios');
const app = express();

const CONFIG_URL = 'https://raw.githubusercontent.com/6otho/Yaml-PaKo/refs/heads/main/PAKO2-ZIYONG.yaml';

app.get('/', async (req, res) => {
  try {
    // 直接从固定URL加载 YAML 配置文件
    const response = await axios.get(CONFIG_URL, {
      headers: { 'User-Agent': 'Clash Verge' }
    });
    const rawData = response.data;

    // 如果你的配置文件没有经过 Base64 编码，直接返回原始内容
    res.set('Content-Type', 'text/yaml');
    res.send(rawData);
  } catch (error) {
    res.status(500).send(`获取配置失败：${error.message}`);
  }
});

module.exports = app;
