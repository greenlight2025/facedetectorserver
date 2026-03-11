const axios = require('axios');

// 修复1：增加 CORS 头部（关键）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// 获取百度 Token（增加超时和错误处理）
async function getToken() {
  if (!process.env.BAIDU_API_KEY || !process.env.BAIDU_SECRET_KEY) {
    throw new Error('未配置百度API密钥，请在Netlify环境变量中设置BAIDU_API_KEY和BAIDU_SECRET_KEY');
  }

  try {
    const url = 'https://aip.baidubce.com/oauth/2.0/token';
    const params = {
      grant_type: 'client_credentials',
      client_id: process.env.BAIDU_API_KEY,
      client_secret: process.env.BAIDU_SECRET_KEY
    };
    const res = await axios.post(url, null, { 
      params,
      timeout: 10000 // 10秒超时
    });
    if (!res.data.access_token) {
      throw new Error('获取Token失败：' + JSON.stringify(res.data));
    }
    return res.data.access_token;
  } catch (err) {
    throw new Error(`获取Token出错：${err.message}`);
  }
}

// 解析百度返回结果（增加空值保护）
function parseResult(raw) {
  // 处理百度接口错误
  if (raw.error_code !== 0) {
    return `❌ 百度API错误：${raw.error_msg || '未知错误'}（错误码：${raw.error_code}）`;
  }

  // 检查核心数据是否存在
  if (!raw.result || !raw.result.face_list || raw.result.face_list.length === 0) {
    return '✅ 检测完成，但未识别到人脸';
  }

  const face = raw.result.face_list[0];
  
  // 构建结果（所有字段增加默认值）
  const resultLines = [
    `✅ 检测到 ${raw.result.face_num || 0} 个人脸`,
    `👤 性别：${face.gender?.type === 'male' ? '男' : face.gender?.type === 'female' ? '女' : '未知'}（置信度：${face.gender?.probability?.toFixed(2) || 0}）`,
    `🎂 年龄：${face.age || '未知'} 岁`,
    `💖 颜值评分：${face.beauty || 0} 分（满分100）`,
    `😀 表情：${face.expression?.type || '未知'}（置信度：${face.expression?.probability?.toFixed(2) || 0}）`,
    `❤️ 情绪：${face.emotion?.type || '未知'}（置信度：${face.emotion?.probability?.toFixed(4) || 0}）`,
    `👓 眼镜：${face.glasses?.type === 'none' ? '无' : face.glasses?.type || '未知'}（置信度：${face.glasses?.probability?.toFixed(2) || 0}）`,
    `😷 口罩：${face.mask?.type === 0 ? '未佩戴' : face.mask?.type === 1 ? '佩戴' : '未知'}（置信度：${face.mask?.probability?.toFixed(2) || 0}）`,
    `📸 图片质量：模糊度${face.quality?.blur || 0} | 光照度${face.quality?.illumination || 0}`
  ];

  return resultLines.join('\n');
}

// Netlify 函数主入口（完整错误捕获）
exports.handler = async (event) => {
  // 处理 OPTIONS 预检请求（解决跨域）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true })
    };
  }

  // 处理 POST 请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ parsed: '❌ 仅支持POST请求' })
    };
  }

  try {
    // 解析前端传入的参数（增加错误处理）
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (err) {
      throw new Error('前端请求参数解析失败：' + err.message);
    }

    if (!requestBody.image) {
      throw new Error('缺少图片Base64数据');
    }

    // 1. 获取百度Token
    const token = await getToken();

    // 2. 调用百度人脸检测API
    const detectRes = await axios.post(
      `https://aip.baidubce.com/rest/2.0/face/v3/detect?access_token=${token}`,
      {
        image: requestBody.image,
        image_type: 'BASE64',
        face_field: 'age,gender,beauty,expression,emotion,glasses,mask,quality'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000 // 15秒超时
      }
    );

    // 3. 解析结果
    const parsedResult = parseResult(detectRes.data);

    // 4. 返回标准JSON响应（核心：确保始终返回合法JSON）
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        parsed: parsedResult,
        raw: detectRes.data
      }, null, 2) // 格式化JSON，避免解析错误
    };

  } catch (err) {
    // 捕获所有异常，返回友好错误（确保返回合法JSON）
    console.error('函数执行错误：', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        parsed: `❌ 检测失败：${err.message}`,
        error: err.message
      }, null, 2)
    };
  }
};
