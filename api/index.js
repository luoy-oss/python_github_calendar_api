const axios = require('axios');

// 辅助函数：列表分块 (对应 Python 的 list_split)
function listSplit(items, n) {
  const result = [];
  for (let i = 0; i < items.length; i += n) {
    result.push(items.slice(i, i + n));
  }
  return result;
}

async function getdata(name) {
  // 1. 定义 Headers (完全照搬 Python 代码中的 headers)
  const headers = {
    'Referer': `https://github.com/${name}`,
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Microsoft Edge";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
    'X-Requested-With': 'XMLHttpRequest'
  };

  try {
    // 2. 发送请求 (完全照搬 URL 构造逻辑)
    // 注意：Python 代码中拼接了特定的查询参数
    const url = `https://github.com/${name}?action=show&controller=profiles&tab=contributions&user_id=${name}`;
    
    const response = await axios.get(url, { 
      headers, 
      timeout: 10000,
      // 禁用自动重定向有时能获取到更原始的 HTML，但通常默认即可
      maxRedirects: 5 
    });

    const data = response.data; // 获取 HTML 文本

    // 3. 正则匹配 (完全照搬 Python 的正则逻辑)
    
    // 正则 1: 提取日期 data-date="(.*?)" id="contribution-day-component
    // 在 JS 中，非贪婪匹配同样是 .*?
    const dateReg = /data-date="(.*?)"[^>]*id="contribution-day-component/g;
    
    // 正则 2: 提取数量 <tool-tip .*?class="sr-only position-absolute">(.*?) contribution
    // 注意：HTML 中 class 的顺序可能会变，Python 原正则假设 class 紧挨着，这里保持原样
    // 为了更稳健，稍微放宽一点 class 的匹配，但核心逻辑不变
    const countReg = /<tool-tip[^>]*class="sr-only position-absolute"[^>]*>(.*?)\s+contribution/g;

    const datadate = [];
    const datacountRaw = [];
    
    let matchDate;
    while ((matchDate = dateReg.exec(data)) !== null) {
      datadate.push(matchDate[1]);
    }

    let matchCount;
    while ((matchCount = countReg.exec(data)) !== null) {
      datacountRaw.push(matchCount[1]);
    }

    // 4. 数据清洗 (对应 Python: list(map(int, [0 if i == "No" else i for i in datacount])))
    const datacount = datacountRaw.map(item => {
      if (item === "No" || item === "no" || !item) return 0;
      const num = parseInt(item, 10);
      return isNaN(num) ? 0 : num;
    });

    // 5. 空数据检查
    if (datadate.length === 0 || datacount.length === 0) {
      return { total: 0, contributions: [] };
    }

    // 6. 排序 (对应 Python: sorted(zip(...)))
    // 将日期和数量打包，按日期排序
    const paired = datadate.map((date, index) => ({ date, count: datacount[index] }));
    
    paired.sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });

    // 解包回数组 (可选，直接处理对象数组更方便)
    const sortedDates = paired.map(p => p.date);
    const sortedCounts = paired.map(p => p.count);

    // 7. 计算总数和构建列表
    const contributionsTotal = sortedCounts.reduce((acc, curr) => acc + curr, 0);
    
    const datalist = sortedDates.map((date, index) => ({
      date: date,
      count: sortedCounts[index]
    }));

    // 8. 分块 (每行 7 天)
    const datalistsplit = listSplit(datalist, 7);

    return {
      total: contributionsTotal,
      contributions: datalistsplit
    };

  } catch (error) {
    console.error(`Error fetching data for ${name}:`, error.message);
    // 发生错误时返回空结构，避免前端崩溃
    return { 
      total: 0, 
      contributions: [], 
      error: error.message 
    };
  }
}

// Vercel Serverless Function 入口
module.exports = async (req, res) => {
  // 设置 CORS 头 (对应 Python: self.send_header('Access-Control-Allow-Origin', '*'))
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 解析参数 (对应 Python: path.split('?')[1:]...)
  // Vercel 的 req.query 已经自动解析了 query string
  const username = req.query.user;

  if (!username) {
    return res.status(400).json({ error: "Missing 'user' parameter. Usage: /api?user=github_username" });
  }

  const result = await getdata(username);
  
  return res.status(200).json(result);
};