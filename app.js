// 打卡助手（网页端版本）
// 说明：复刻了 1_daka.js 的核心接口调用逻辑，并用 fetch 实现按钮功能

// =========================
// 基础工具函数
// =========================
function padZero(num) {
  return num < 10 ? "0" + num : "" + num;
}

function formatDate(date, format) {
  if (!format) format = "YYYY-MM-DD HH:mm:ss";
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = padZero(d.getMonth() + 1);
  const day = padZero(d.getDate());
  const hours = padZero(d.getHours());
  const minutes = padZero(d.getMinutes());
  const seconds = padZero(d.getSeconds());

  return format
    .replace("YYYY", year)
    .replace("MM", month)
    .replace("DD", day)
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
}

function parseDateLocal(dateStr) {
  // 避免 new Date('YYYY-MM-DD') 在浏览器里按 UTC 解析导致日期偏移
  const parts = dateStr.split("-").map((x) => Number(x));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  return new Date(y, m - 1, d);
}

function getStartOfMonth(format) {
  if (!format) format = "YYYY-MM-DD";
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  // 使用 date 对象格式化
  return formatDate(firstDay, format);
}

function addDays(dateStr, days, format) {
  if (!format) format = "YYYY-MM-DD";
  const date = parseDateLocal(dateStr);
  date.setDate(date.getDate() + days);
  return formatDate(date, format);
}

function getDaysInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  el.textContent = text;
}

function setBusy(isBusy) {
  const btnWork = document.getElementById("btnWork");
  const btnOff = document.getElementById("btnOff");
  const btnLogs = document.getElementById("btnLogs");
  btnWork.disabled = isBusy;
  btnOff.disabled = isBusy;
  btnLogs.disabled = isBusy;
}

function renderLogs(lines) {
  const ul = document.getElementById("logList");
  ul.innerHTML = "";
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
}

async function postForm(url, data, headers) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data || {})) {
    body.append(k, String(v));
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(headers || {}),
    },
    body: body.toString(),
    // 有些接口可能校验 Referer（网页端无法完全自定义 Referer header，但可以尝试设置 referrer）
    referrer: "https://eip.chint.com/kq/mobile/",
    referrerPolicy: "strict-origin-when-cross-origin",
  });

  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { httpStatus: resp.status, raw: text };
  }
}

// =========================
// 业务逻辑（复刻 1_daka.js）
// =========================

const latLng = [
  ["28.016591", "120.877513"],
  ["28.014663", "120.877401"],
  ["28.015645", "120.878028"],
  ["28.015958", "120.877553"],
  ["28.016524", "120.876658"],
  ["28.015104", "120.877964"],
  ["28.016525", "120.876961"],
  ["28.016531", "120.876885"],
  ["28.016599", "120.877628"],
  ["28.016372", "120.876003"],
];

const address = [
  "中国温州市乐清市北白象镇尚长路正泰物联网传感器产业园",
  "浙江省温州市乐清市北白象镇红星中路正泰物联网传感器产业园",
  "浙江省温州市乐清市北白象镇长东路正泰物联网传感器产业园",
];

// 已按你的要求改为 240528005
const TICKET = "240528005";

// Cloudflare Worker 代理地址（创建 Worker 后把这里替换成你的 worker URL）
// 例如：https://abcd1234.yourname.workers.dev
const PROXY_BASE = "https://chint-daka.1500653785.workers.dev/";

function proxyUrl(path) {
  return PROXY_BASE.replace(/\/$/, "") + path;
}

let token = "";

async function getToken() {
  setStatus("正在获取 token...");
  const url = proxyUrl("/check-login-ticket");
  const result = await postForm(
    url,
    { ticket: TICKET },
    {
      // 1_daka.js 这里只设置了 Content-Type；token 获取不需要 token header
    }
  );

  if (result && result.status === 200 && result.results && result.results.token) {
    token = result.results.token;
    setStatus("获取 token 成功");
    return token;
  }

  const msg = result?.message || "获取 token 失败";
  setStatus(msg);
  throw new Error(msg);
}

async function getCardInfo(dateStr) {
  const url = proxyUrl("/get-card-info");

  const result = await postForm(
    url,
    { date: dateStr },
    {
      token: token,
    }
  );
  return result;
}

async function getCardLogs() {
  setBusy(true);
  try {
    setStatus("正在获取打卡记录...");
    renderLogs([]);

    await getToken();

    const daysInMonth = getDaysInMonth();
    const startDate = getStartOfMonth();

    const promises = [];
    for (let i = 0; i < daysInMonth; i++) {
      const currentDate = addDays(startDate, i);
      // 让并发更快，但也更容易触发接口限流；失败会直接抛出
      promises.push(getCardInfo(currentDate));
    }

    const allResults = await Promise.all(promises);

    const cardLogs = [];
    for (let j = 0; j < allResults.length; j++) {
      const result = allResults[j];
      const logDate = addDays(startDate, j);

      if (result && result.status === 200 && result.results && result.results.cardLogList) {
        const list = result.results.cardLogList;
        for (const log of list) {
          const typeText = log.type === "begin" ? "上班" : "下班";
          cardLogs.push(`${logDate} ${log.time} -- ${typeText}打卡`);
        }
      }
    }

    if (cardLogs.length > 0) {
      renderLogs(cardLogs);
      setStatus(`共获取到 ${cardLogs.length} 条打卡记录`);
    } else {
      renderLogs([]);
      setStatus("本月暂无打卡记录");
    }
  } finally {
    setBusy(false);
  }
}

async function daka(cardType) {
  // cardType 目前只用于提示文案（1_daka.js 的接口请求体里并没有携带 begin/end）
  const typeText = cardType === "begin" ? "上班" : "下班";

  const randlnglat = latLng[Math.floor(Math.random() * latLng.length)];
  const randAddress = address[Math.floor(Math.random() * address.length)];

  const currentTime = formatDate(new Date());
  setStatus(`${currentTime} 正在${typeText}打卡...`);

  const url = proxyUrl("/create-card-log");
  const result = await postForm(
    url,
    {
      location: randAddress,
      lng: randlnglat[1],
      lat: randlnglat[0],
    },
    {
      token: token,
    }
  );

  if (result && result.status === 200) {
    const msg = `${typeText}打卡成功`;
    setStatus(`${currentTime} ${msg}`);
    return result;
  }

  const msg = `${typeText}打卡出错: ${result?.message || "未知错误"}`;
  setStatus(`${currentTime} ${msg}`);
  throw new Error(msg);
}

async function sbinit() {
  setBusy(true);
  try {
    await getToken();
    await daka("begin");
  } finally {
    setBusy(false);
  }
}

async function xbinit() {
  setBusy(true);
  try {
    await getToken();
    await daka("end");
  } finally {
    setBusy(false);
  }
}

// =========================
// 绑定事件
// =========================
document.getElementById("btnWork").addEventListener("click", () => {
  sbinit().catch((err) => {
    console.error(err);
    // 上层已经 setStatus，这里避免控制台静默
  });
});

document.getElementById("btnOff").addEventListener("click", () => {
  xbinit().catch((err) => {
    console.error(err);
  });
});

document.getElementById("btnLogs").addEventListener("click", () => {
  getCardLogs().catch((err) => {
    console.error(err);
    setStatus(`获取记录失败：${err?.message || err}`);
  });
});

setStatus("打卡助手已启动");
renderLogs([]);

