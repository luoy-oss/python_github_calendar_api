// api/index.js
const axios = require('axios');
const cheerio = require('cheerio');

// 辅助函数：将数组分块
function listSplit(items, n) {
  const result = [];
  for (let i = 0; i < items.length; i += n) {
    result.push(items.slice(i, i + n));
  }
  return result;
}

async function getGithubData(username) {
  try {
    const url = `https://github.com/${username}`;
    
    // 设置 Headers 伪装成浏览器
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': `https://github.com/${username}`,
    };

    const response = await axios.get(url, { headers, timeout: 10000 });
    
    if (response.status !== 200) {
      return { total: 0, contributions: [], error: `GitHub returned status ${response.status}` };
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // 选择器策略：GitHub 的贡献图现在通常包裹在 <svg class="js-calendar-graph-svg"> 中
    // 每个格子是 <rect> 标签
    // data-date 属性包含日期
    // data-count 属性包含贡献数 (或者通过 fill 颜色判断，但 data-count 最直接)
    
    const contributions = [];
    let totalCount = 0;

    // 查找所有贡献格子
    // 注意：GitHub 的类名可能会变，但 rect 标签和 data 属性通常很稳定
    $('rect[data-date]').each((i, elem) => {
      const date = $(elem).attr('data-date');
      const countStr = $(elem).attr('data-count');
      const count = parseInt(countStr, 10) || 0;

      if (date) {
        contributions.push({ date, count });
        totalCount += count;
      }
    });

    if (contributions.length === 0) {
      // 可能是私有账户或用户名错误
      return { 
        total: 0, 
        contributions: [], 
        message: "未找到贡献数据。请检查用户名是否正确，或该用户未公开贡献图。" 
      };
    }

    // 按日期排序 (虽然 GitHub 返回的通常是有序的，但保险起见)
    contributions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 格式化为周数组 (每行 7 天)
    const weeklyData = listSplit(contributions, 7);

    return {
      total: totalCount,
      contributions: weeklyData
    };

  } catch (error) {
    console.error(`Error fetching data for ${username}:`, error.message);
    return { 
      total: 0, 
      contributions: [], 
      error: error.message 
    };
  }
}

// Vercel Serverless Function 入口
module.exports = async (req, res) => {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  // 处理预检请求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 解析查询参数 ?user=xxx
  // Vercel 中 req.query 已经解析好了
  const username = req.query.user;

  if (!username) {
    return res.status(400).json({ error: "Missing 'user' parameter" });
  }

  const data = await getGithubData(username);
  
  return res.status(200).json(data);
};