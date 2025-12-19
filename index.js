import puppeteer from 'puppeteer';
import axios from 'axios';
import cfonts from 'cfonts';
import gradient from 'gradient-string';
import chalk from 'chalk';
import fs from 'fs/promises';
import readline from 'readline';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import ora from 'ora';
import ProxyChain from 'proxy-chain';


const logger = {
  info: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || 'ℹ️  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.green('INFO');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  warn: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '⚠️ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.yellow('WARN');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  error: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '❌ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.red('ERROR');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  debug: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '🔍  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.blue('DEBUG');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  }
};

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function countdown(seconds, message) {
  return new Promise((resolve) => {
    let remaining = seconds;
    process.stdout.write(`${message} ${remaining}s remaining...`);
    const interval = setInterval(() => {
      remaining--;
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`${message} ${remaining}s remaining...`);
      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        resolve();
      }
    }, 1000);
  });
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function centerText(text, width) {
  const cleanText = stripAnsi(text);
  const textLength = cleanText.length;
  const totalPadding = Math.max(0, width - textLength);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
}

function printHeader(title) {
  const width = 80;
  console.log(gradient.morning(`┬${'─'.repeat(width - 2)}┬`));
  console.log(gradient.morning(`│ ${title.padEnd(width - 4)} │`));
  console.log(gradient.morning(`┴${'─'.repeat(width - 2)}┴`));
}

function printInfo(label, value, context) {
  logger.info(`${label.padEnd(15)}: ${chalk.cyan(value)}`, { emoji: '📍 ', context });
}

function printProfileInfo(email, points, context) {
  printHeader(`Profile Info ${context}`);
  printInfo('Email', maskEmail(email), context);
  printInfo('Total Points', points.toString(), context);
  console.log('\n');
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/102.0'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getAxiosConfig(proxy, additionalHeaders = {}, cookies = []) {
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': 'https://app.presens.network',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': getRandomUserAgent(),
    ...additionalHeaders
  };
  if (cookies.length > 0) {
    headers['cookie'] = cookies.join('; ');
  }
  const config = {
    headers,
    timeout: 60000
  };
  if (proxy) {
    config.httpsAgent = newAgent(proxy);
    config.proxy = false;
  }
  return config;
}

function newAgent(proxy) {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
    return new SocksProxyAgent(proxy);
  } else {
    logger.warn(`Unsupported proxy: ${proxy}`);
    return null;
  }
}

function parseProxy(proxy) {
  const u = new URL(proxy);
  return {
    server: `${u.protocol}//${u.hostname}:${u.port}`,
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password)
  };
}


async function requestWithRetry(method, url, payload = null, config = {}, retries = 3, backoff = 2000, context) {
  for (let i = 0; i < retries; i++) {
    try {
      let response;
      if (method.toLowerCase() === 'get') {
        response = await axios.get(url, config);
      } else if (method.toLowerCase() === 'post') {
        response = await axios.post(url, payload, config);
      } else {
        throw new Error(`Method ${method} not supported`);
      }
      return response;
    } catch (error) {
      let errorMsg = error.message;
      if (error.response) {
        errorMsg += ` | Status: ${error.response.status} | Body: ${JSON.stringify(error.response.data || 'No body')}`;
      }
      logger.error(`Request failed: ${errorMsg}`, { context });

      if (error.response && error.response.status === 429) {
        backoff = Math.max(backoff, 5000);
      }

      if (error.response && error.response.status >= 500 && i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries}) due to server error`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 2;
        continue;
      }
      if (i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries})`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      throw error;
    }
  }
}

async function readAccounts() {
  try {
    const data = await fs.readFile('account.json', 'utf-8');
    const accounts = JSON.parse(data);
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('No accounts found in account.json or invalid format');
    }
    logger.info(`Loaded ${accounts.length} account${accounts.length === 1 ? '' : 's'}`, { emoji: '🔑 ' });
    return accounts;
  } catch (error) {
    logger.error(`Failed to read account.json: ${error.message}`, { emoji: '❌ ' });
    return [];
  }
}

async function readProxies() {
  try {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxies.length === 0) {
      logger.warn('No proxies found. Proceeding without proxy.', { emoji: '⚠️ ' });
    } else {
      logger.info(`Loaded ${proxies.length} prox${proxies.length === 1 ? 'y' : 'ies'}`, { emoji: '🌐 ' });
    }
    return proxies;
  } catch (error) {
    logger.warn('proxy.txt not found.', { emoji: '⚠️ ' });
    return [];
  }
}

function maskEmail(email) {
  if (!email) return 'N/A';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 3)}${'*'.repeat(user.length - 3)}@${domain}`;
}

async function getPublicIP(proxy, context) {
  try {
    const config = getAxiosConfig(proxy);
    const response = await requestWithRetry('get', 'https://api.ipify.org?format=json', null, config, 3, 2000, context);
    return response.data.ip || 'Unknown';
  } catch (error) {
    logger.error(`Failed to get IP: ${error.message}`, { emoji: '❌ ', context });
    return 'Error retrieving IP';
  }
}

async function safeGoto(page, url, options = {}) {
  const retries = 3;
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: options.timeout || 60000 });
      return;
    } catch (err) {
      logger.warn(`page.goto failed (attempt ${i + 1}/${retries}): ${err.message}`);
      if (i === retries - 1) throw err;
      await delay(2 + i);
    }
  }
}

async function safeEval(page, fn, ...args) {
  try {
    return await page.evaluate(fn, ...args);
  } catch (err) {
    if (err.message && err.message.includes('Execution context was destroyed')) {
      logger.warn('Execution context destroyed during evaluate — retrying after short reload.');
      try { await page.reload({ waitUntil: 'networkidle2', timeout: 15000 }); } catch {}
      await delay(2);
      return await page.evaluate(fn, ...args);
    }
    throw err;
  }
}


async function processAccount(account, index, total, proxy) {
  const context = `Account ${index + 1}/${total}`;
  logger.info(chalk.bold.magentaBright(`Starting account processing`), { emoji: '🚀 ', context });

  const { email, password } = account;
  if (!email || !password) {
    logger.error('Invalid account credentials', { emoji: '❌ ', context });
    return;
  }

  printHeader(`Account Info ${context}`);
  printInfo('Masked Email', maskEmail(email), context);
  const ip = await getPublicIP(proxy, context);
  printInfo('IP', ip, context);
  console.log('\n');

  const spinner = ora({ text: 'Launching browser...', spinner: 'dots' }).start();
  let browser;
  let anonymizedProxy = null;
  try {
    const launchArgs = ['--no-sandbox'];
    if (proxy) {
      try {
        anonymizedProxy = await ProxyChain.anonymizeProxy(proxy);
        launchArgs.push(`--proxy-server=${anonymizedProxy}`);
      } catch (err) {
        logger.warn(`Failed to anonymize proxy: ${err.message}. Proceeding without proxy for browser.`, { context });
      }
    }
    
    browser = await puppeteer.launch({
      headless: false,
      args: launchArgs,
      defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(getRandomUserAgent());

    spinner.text = 'Preparing To Login Presens Network...';
    await safeGoto(page, 'https://app.presens.network/dl/e2c31f', { timeout: 60000 });

    spinner.text = 'Injecting Data for login...';
    await page.evaluate((em, pw) => {
      localStorage.setItem('qfH4ucg6IVlgiQfHEdUa.stored-email', em);
      localStorage.setItem('qfH4ucg6IVlgiQfHEdUa.stored-password', pw);
    }, email, password);

    spinner.text = 'Try Bypassing Login...';
    await page.reload({ waitUntil: 'networkidle2' });

    spinner.text = 'Login Proccesed , Please Wait...';
    try {
      await page.waitForSelector('div[data-testid="wire-container"]', { timeout: 30000 });
    } catch (err) {
      throw new Error('Login failed: Quest container not found after timeout');
    }

    spinner.stop();
    logger.info(chalk.bold.greenBright(`Login Successfully`), { emoji: '✅ ', context });
    await delay(5);

    console.log('\n');
    logger.info('Starting Task Completion Process...', { emoji: '📋 ', context });
    console.log('\n');
    await delay(5);

    const allTasks = await page.evaluate(() => {
      const taskElements = Array.from(document.querySelectorAll('div[data-testid^="collection-item-"]'));
      return taskElements.map((el, idx) => {
        const title = el.querySelector('p.card-collection-list___StyledP2-s6kvv4-19')?.innerText || '';
        const claimText = el.querySelector('p.card-collection-list___StyledP3-s6kvv4-20')?.innerText || '';
        const hasArrow = !!el.querySelector('div.card-collection-list___StyledDiv9-s6kvv4-15');
        const hasClaimButton = !!el.querySelector('button[data-testid="card-primary-button"]');
        const isClickable = el.getAttribute('role') === 'button';
        const isReadyToClaim = claimText.includes('Next Claim Now');
        let status = '';
        if (isReadyToClaim) {
          status = 'Ready to Claim - Next Claim Now';
        } else {
          const nextClaim = claimText.split('\n')[1] || 'N/A';
          status = `Completed - ${nextClaim}`;
        }
        return { index: idx, title, claimText, isReadyToClaim, hasArrow, hasClaimButton, isClickable, status };
      });
    });

    printHeader(`Task List ${context}`);
    allTasks.forEach((task) => {
      const color = task.isReadyToClaim ? chalk.yellowBright : chalk.greenBright;
      logger.info(`Task ${task.title} ${color(task.status)}`, { emoji: '📝 ', context });
    });
    console.log('');

    const readyTasks = allTasks.filter(task => task.isReadyToClaim && (task.hasArrow || task.hasClaimButton));

    if (readyTasks.length === 0) {
      logger.info('No tasks ready to claim.', { emoji: 'ℹ️ ', context });
    } else {
      for (let i = 0; i < readyTasks.length; i++) {
        const task = readyTasks[i];
        const taskSpinner = ora({ text: `Completing task ${task.title}...`, spinner: 'dots' }).start();
        const taskSelector = `div[data-testid="collection-item-${task.index}"]`;
        const claimButtonSelector = `${taskSelector} button[data-testid="card-primary-button"]`;

        try {
          if (task.hasClaimButton) {
            const claimButton = await page.waitForSelector(claimButtonSelector, { timeout: 10000 });
            await claimButton.click();
          } else {
            const [newPagePromise] = await Promise.all([
              new Promise(resolve => browser.once('targetcreated', target => resolve(target.page()))),
              page.click(taskSelector)
            ]);
            const newPage = await newPagePromise;
            await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            await newPage.close();
            const claimButton = await page.waitForSelector(claimButtonSelector, { timeout: 10000 });
            await claimButton.click();
          }

          await page.waitForSelector('div.use-wire-frontend-action-callbacks___StyledDiv-sc-1l2bv37-0.enter.success', { timeout: 10000 });
          taskSpinner.succeed(chalk.bold.greenBright(` Task ${task.title} Completed!`));
        } catch (error) {
          taskSpinner.fail(chalk.bold.redBright(`Failed to complete task ${task.title}: ${error.message}`));
        }

        if (i < readyTasks.length - 1) {
          const randomDelay = Math.floor(Math.random() * 5) + 15;
          await delay(randomDelay);
        }
      }
    }

    console.log('\n');
    await delay(7);

    let points = 0;
    try {
      await page.waitForSelector('h2[data-testid="wire-text"]', { timeout: 10000 });
      await delay(2); 
      points = await page.evaluate(() => {
        const pointsElement = document.querySelector('h2[data-testid="wire-text"]');
        return pointsElement ? parseInt(pointsElement.innerText.replace(/,/g, '')) : 0;
      });
      if (points === 0) {
        logger.debug('Points element found but parsed value is 0; possible loading issue.', { emoji: '🔍 ', context });
      }
    } catch (error) {
      logger.warn(`Failed to retrieve points: ${error.message}`, { emoji: '⚠️ ', context });
    }

    printProfileInfo(email, points || 'N/A', context);

    logger.info(chalk.bold.greenBright(`Completed account processing`), { emoji: '🎉 ', context });
    console.log(chalk.cyanBright('________________________________________________________________________________'));
  } catch (error) {
    spinner.fail(chalk.bold.redBright(`Error processing account: ${error.message}`));
    logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context });
  } finally {
    if (browser) await browser.close();
  }
}

let globalUseProxy = false;
let globalProxies = [];

async function initializeConfig() {
  const useProxyAns = await askQuestion(chalk.cyanBright('🔌 Do You Want to Use Proxy? (y/n): '));
  if (useProxyAns.trim().toLowerCase() === 'y') {
    globalUseProxy = true;
    globalProxies = await readProxies();
    if (globalProxies.length === 0) {
      globalUseProxy = false;
      logger.warn('No proxies available, proceeding without proxy.', { emoji: '⚠️ ' });
    }
  } else {
    logger.info('Proceeding without proxy.', { emoji: 'ℹ️ ' });
  }
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function runCycle() {
  const accounts = await readAccounts();
  if (accounts.length === 0) {
    logger.error('No accounts found in account.json. Exiting cycle.', { emoji: '❌ ' });
    return;
  }

  for (let i = 0; i < accounts.length; i++) {
    const proxy = globalUseProxy ? globalProxies[i % globalProxies.length] : null;
    try {
      await processAccount(accounts[i], i, accounts.length, proxy);
    } catch (error) {
      logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context: `Account ${i + 1}/${accounts.length}` });
    }
    if (i < accounts.length - 1) {
      console.log('\n\n');
    }
    await delay(Math.floor(Math.random() * 6) + 10);
  }
}

async function run() {
  const terminalWidth = process.stdout.columns || 80;
  cfonts.say('NT EXHAUST', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta'],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true
  });
  console.log(gradient.retro(centerText('=== Telegram Channel 🚀 : NT Exhaust (@NTExhaust) ===', terminalWidth)));
  console.log(gradient.retro(centerText('✪ BOT PRESENS AUTO COMPLETE TASK ✪', terminalWidth)));
  console.log('\n');
  await initializeConfig();

  while (true) {
    await runCycle();
    console.log();
    logger.info(chalk.bold.yellowBright('Cycle completed. Waiting 24 hours...'), { emoji: '🔄 ' });
    await delay(86400);
  }
}

run().catch(error => logger.error(`Fatal error: ${error.message}`, { emoji: '❌' }));