const axios = require('axios');

// 从 Netlify 环境变量读取密钥（安全）
const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

// 获取百度 Access Token
async function getToken() {
  const url = 'https://aip.baidubce.com/oauth/2.0/token';
  const params = {
    grant_type: 'client_credentials',
    client_id: API_KEY,
    client_secret: SECRET_KEY
  };
  const res = await axios.post(url, null, { params });
  return res.data.access_token;
}

// 解析结果（和你之前的逻辑一致）
function parseResult(raw) {
  if (raw.error_code !== 0) return `❌ 失败：${raw.error_msg}`;
  const face = raw.result?.face_list?.[0];
  if (!face) return '未检测到人脸';

  return [
    `✅ 检测到 ${raw.result.face_num} 人`,
    `👤 性别：${face.gender.type === 'male' ? '男' : '女'}（${face.gender.probability.toFixed(2)}）`,
    `🎂 年龄：${face.age} 岁`,
    `💖 颜值：${face.beauty} 分`,
    `😀 表情：${face.expression.type}`,
    `❤️ 情绪：${face.emotion.type}（${face.emotion.probability.toFixed(4)}）`,
    `📸 质量：模糊=${face.quality.blur}，光照=${face.quality.illumination}`
  ].join('\n');
}

// Netlify 函数入口
exports.handler = async (event) => {
  try {
    const { image } = JSON.parse(event.body);
    const token = await getToken();

    // 调用百度人脸检测
    const detectRes = await axios.post(
      `https://aip.baidubce.com/rest/2.0/face/v3/detect?access_token=${token}`,
      {
        image,
        image_type: 'BASE64',
        face_field: 'age,gender,beauty,expression,emotion,quality'
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        parsed: parseResult(detectRes.data),
        raw: detectRes.data
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ parsed: `❌ 错误：${err.message}` })
    };
  }
};
