import dotenv from 'dotenv';
import path from 'path';
import p from '../../../package.json';
import {
  cleanEnv,
  str,
  host,
  bool,
  json,
  makeValidator,
  num,
  EnvError,
  port,
} from 'envalid';
try {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
} catch (error) {
  console.error('Error loading .env file', error);
}

// define default timeouts and urls here so we can use them in the validators
// so we can use them in the validators
const DEFAULT_TIMEOUT = 15000; // 15 seconds

const secretKey = makeValidator((x) => {
  if (typeof x !== 'string') {
    throw new Error('Secret key must be a string');
  }
  // backwards compatibility for 32 character secret keys
  if (x.length === 32) {
    return x;
  }
  if (x.length === 64) {
    if (!/^[0-9a-fA-F]{64}$/.test(x)) {
      throw new EnvError('64-character secret key must be a hex string');
    }
    return x;
  }
  throw new EnvError('Secret key must be a 64-character hex string');
});

const regex = makeValidator((x) => {
  if (typeof x !== 'string') {
    throw new Error('Regex pattern must be a string');
  }
  try {
    new RegExp(x);
    return x;
  } catch (e) {
    throw new Error(`Invalid regex pattern: ${x}`);
  }
});

const multipleRegex = makeValidator((x) => {
  if (typeof x !== 'string') {
    throw new EnvError('Regex pattern must be a string');
  }

  const patterns = x.split(/\s+/).filter(Boolean);
  if (patterns.length > parseInt(process.env.MAX_REGEX_SORT_PATTERNS || '30')) {
    throw new EnvError(
      `Too many regex sort patterns in environment variables (max is ${process.env.MAX_REGEX_SORT_PATTERNS || '30'})`
    );
  }
  // try compiling each pattern to check for validity
  // each "pattern" is regexName::regexPattern, where regexName is optional
  // we need to only extract the regexPattern part,
  patterns.forEach((p) => {
    try {
      const delimiterIndex = p.indexOf('<::>');
      if (delimiterIndex !== -1) {
        p = p.slice(delimiterIndex + 2);
      }
      new RegExp(p);
    } catch (e) {
      throw new EnvError(`Invalid regex pattern: ${p}`);
    }
  });

  // return normal input
  return x;
});

const url = makeValidator((x) => {
  if (x === '') {
    return x;
  }
  try {
    new URL(x);
  } catch (e) {
    throw new EnvError(`Invalid URL: ${x}`);
  }
  return x.endsWith('/') ? x : `${x}/`;
});

export const forcedPort = makeValidator<string>((input: string) => {
  if (input === '') {
    return '';
  }

  const coerced = +input;
  if (
    Number.isNaN(coerced) ||
    `${coerced}` !== `${input}` ||
    coerced % 1 !== 0 ||
    coerced < 1 ||
    coerced > 65535
  ) {
    throw new EnvError(`Invalid port input: "${input}"`);
  }
  return coerced.toString();
});

const userAgent = makeValidator((x) => {
  if (typeof x !== 'string') {
    throw new Error('User agent must be a string');
  }
  // replace {version} with the version of the addon
  return x.replace(/{version}/g, p.version);
});

const customConfigs = makeValidator((x) => {
  try {
    const parsed = JSON.parse(x);
    if (typeof parsed !== 'object') {
      throw new Error('Custom configs must be an object');
    }
    // must be a simple key-value object, of string-string
    for (const key in parsed) {
      if (typeof parsed[key] !== 'string') {
        throw new Error(
          `Custom config ${key} must be a string, got ${typeof parsed[key]}`
        );
      }
    }
    return parsed;
  } catch (e) {
    throw new Error('Custom configs must be a valid JSON string');
  }
});

export const Settings = cleanEnv(process.env, {
  ADDON_NAME: str({
    default: 'AIOStreams',
    desc: 'Name of the addon',
  }),
  ADDON_ID: str({
    default: 'aiostreams.viren070.com',
    desc: 'ID of the addon',
  }),
  PORT: port({
    default: 3000,
    desc: 'Port to run the addon on',
  }),
  BRANDING: str({
    default: process.env.NEXT_PUBLIC_ELFHOSTED_BRANDING,
    desc: 'Branding for the addon',
  }),
  SECRET_KEY: secretKey({
    default: '',
    desc: 'Secret key for the addon, used for encryption and must be 64 characters of hex',
  }),
  API_KEY: str({
    default: '',
    desc: 'API key for the addon, can be set to anything',
  }),
  SHOW_DIE: bool({
    default: false,
    desc: 'Show a game die emoji in streams for non-custom formats',
  }),
  DETERMINISTIC_ADDON_ID: bool({
    default: true,
    desc: 'Deterministic addon ID',
  }),

  ADDON_PROXY: url({
    default: '',
    desc: 'Proxy URL for the addon',
  }),
  ADDON_PROXY_CONFIG: str({
    default: undefined,
    desc: 'Proxy config for the addon in format of comma separated hostname:boolean',
  }),

  CUSTOM_CONFIGS: customConfigs<Record<string, string>>({
    default: {},
    desc: 'Custom configs for the addon in JSON key value format, using the key as the config name and the value as the config string',
  }),
  DISABLE_CUSTOM_CONFIG_GENERATOR_ROUTE: bool({
    default: false,
    desc: 'Disable custom config generator route',
  }),

  // logging settings
  LOG_SENSITIVE_INFO: bool({
    default: false,
    desc: 'Log sensitive information',
  }),
  LOG_LEVEL: str({
    default: 'info',
    desc: 'Log level for the addon',
    choices: ['info', 'debug', 'warn', 'error'],
  }),
  LOG_FORMAT: str({
    default: 'text',
    desc: 'Log format for the addon',
    choices: ['text', 'json'],
  }),

  DISABLE_TORRENTIO: bool({
    default: false,
    desc: 'Disable Torrentio addon',
  }),
  DISABLE_TORRENTIO_MESSAGE: str({
    default:
      'The Torrentio addon has been disabled, please remove it to use this addon.',
    desc: 'Message to show when the Torrentio addon is disabled',
  }),

  STREMIO_ADDONS_CONFIG_ISSUER: url({
    default: 'https://stremio-addons.net',
    desc: 'Issuer for the Stremio addons config',
  }),
  STREMIO_ADDONS_CONFIG_SIGNATURE: str({
    default: undefined,
    desc: 'Signature for the Stremio addons config',
  }),

  DEFAULT_USER_AGENT: userAgent({
    default: `AIOStreams/${p.version}`,
    desc: 'Default user agent for the addon',
  }),

  CACHE_MEDIAFLOW_IP_TTL: num({
    default: 900,
    desc: 'Cache TTL for MediaFlow IPs',
  }),
  CACHE_STREMTHRU_IP_TTL: num({
    default: 900,
    desc: 'Cache TTL for StremThru IPs',
  }),
  MAX_CACHE_SIZE: num({
    default: 100000,
    desc: 'Max cache size for the addon',
  }),

  // configuration settings

  MAX_ADDONS: num({
    default: 15,
    desc: 'Max number of addons',
  }),
  MAX_KEYWORD_FILTERS: num({
    default: 30,
    desc: 'Max number of keyword filters',
  }),
  MAX_REGEX_SORT_PATTERNS: num({
    default: 30,
    desc: 'Max number of regex sort patterns',
  }),

  MAX_MOVIE_SIZE: num({
    default: 161061273600,
    desc: 'Max movie size in bytes',
  }),
  MAX_EPISODE_SIZE: num({
    default: 161061273600,
    desc: 'Max episode size in bytes',
  }),
  MAX_TIMEOUT: num({
    default: 50000,
    desc: 'Max timeout for the addon',
  }),
  MIN_TIMEOUT: num({
    default: 1000,
    desc: 'Min timeout for the addon',
  }),

  DEFAULT_TIMEOUT: num({
    default: 15000,
    desc: 'Default timeout for the addon',
  }),

  DEFAULT_REGEX_EXCLUDE_PATTERN: regex({
    default: undefined,
    desc: 'Default regex exclude pattern',
  }),
  DEFAULT_REGEX_INCLUDE_PATTERN: regex({
    default: undefined,
    desc: 'Default regex include pattern',
  }),
  DEFAULT_REGEX_SORT_PATTERNS: multipleRegex({
    default: undefined,
    desc: 'Default regex sort patterns',
  }),

  // MediaFlow settings
  DEFAULT_MEDIAFLOW_URL: url({
    default: '',
    desc: 'Default MediaFlow URL',
  }),
  DEFAULT_MEDIAFLOW_API_PASSWORD: str({
    default: '',
    desc: 'Default MediaFlow API password',
  }),
  DEFAULT_MEDIAFLOW_PUBLIC_IP: str({
    default: '',
    desc: 'Default MediaFlow public IP',
  }),
  MEDIAFLOW_IP_TIMEOUT: num({
    default: 30000,
    desc: 'MediaFlow IP timeout',
  }),
  ENCRYPT_MEDIAFLOW_URLS: bool({
    default: true,
    desc: 'Encrypt MediaFlow URLs',
  }),

  // StremThru settings
  DEFAULT_STREMTHRU_URL: url({
    default: '',
    desc: 'Default StremThru URL',
  }),
  DEFAULT_STREMTHRU_CREDENTIAL: str({
    default: '',
    desc: 'Default StremThru credential',
  }),
  DEFAULT_STREMTHRU_PUBLIC_IP: str({
    default: '',
    desc: 'Default StremThru public IP',
  }),
  STREMTHRU_TIMEOUT: num({
    default: 30000,
    desc: 'StremThru timeout',
  }),
  ENCRYPT_STREMTHRU_URLS: bool({
    default: true,
    desc: 'Encrypt StremThru URLs',
  }),

  COMET_URL: url({
    default: 'https://comet.stremiofr.com/',
    desc: 'Comet URL',
  }),
  COMET_INDEXERS: json({
    default: ['dmm_public_hash_shares_only'],
    desc: 'Comet indexers',
  }),
  FORCE_COMET_HOSTNAME: host({
    default: undefined,
    desc: 'Force Comet hostname',
  }),
  FORCE_COMET_PORT: forcedPort({
    default: undefined,
    desc: 'Force Comet port',
  }),
  FORCE_COMET_PROTOCOL: str({
    default: undefined,
    desc: 'Force Comet protocol',
    choices: ['http', 'https'],
  }),
  DEFAULT_COMET_TIMEOUT: num({
    default: undefined,
    desc: 'Default Comet timeout',
  }),
  DEFAULT_COMET_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Comet user agent',
  }),

  // MediaFusion settings
  MEDIAFUSION_URL: url({
    default: 'https://mediafusion.elfhosted.com/',
    desc: 'MediaFusion URL',
  }),
  MEDIAFUSION_API_PASSWORD: str({
    default: '',
    desc: 'MediaFusion API password',
  }),
  DEFAULT_MEDIAFUSION_TIMEOUT: num({
    default: undefined,
    desc: 'Default MediaFusion timeout',
  }),
  MEDIAFUSION_CONFIG_TIMEOUT: num({
    default: 5000,
    desc: 'MediaFusion config timeout',
  }),
  DEFAULT_MEDIAFUSION_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default MediaFusion user agent',
  }),

  // Jackettio settings
  JACKETTIO_URL: url({
    default: 'https://jackettio.stremiofr.com/',
    desc: 'Jackettio URL',
  }),
  DEFAULT_JACKETTIO_INDEXERS: json({
    default: ['eztv', 'thepiratebay', 'therarbg', 'yts'],
    desc: 'Default Jackettio indexers',
  }),
  DEFAULT_JACKETTIO_STREMTHRU_URL: url({
    default: 'https://stremthru.13377001.xyz',
    desc: 'Default Jackettio StremThru URL',
  }),
  DEFAULT_JACKETTIO_TIMEOUT: num({
    default: undefined,
    desc: 'Default Jackettio timeout',
  }),
  FORCE_JACKETTIO_HOSTNAME: host({
    default: undefined,
    desc: 'Force Jackettio hostname',
  }),
  FORCE_JACKETTIO_PORT: forcedPort({
    default: undefined,
    desc: 'Force Jackettio port',
  }),
  FORCE_JACKETTIO_PROTOCOL: str({
    default: undefined,
    desc: 'Force Jackettio protocol',
    choices: ['http', 'https'],
  }),
  DEFAULT_JACKETTIO_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Jackettio user agent',
  }),

  // Stremio Jackett settings
  STREMIO_JACKETT_URL: url({
    default: 'https://stremio-jackett.elfhosted.com/',
    desc: 'Stremio Jackett URL',
  }),
  DEFAULT_STREMIO_JACKETT_JACKETT_URL: url({
    default: undefined,
    desc: 'Default Stremio Jackett Jackett URL',
  }),
  DEFAULT_STREMIO_JACKETT_JACKETT_API_KEY: str({
    default: undefined,
    desc: 'Default Stremio Jackett Jackett API key',
  }),
  DEFAULT_STREMIO_JACKETT_TMDB_API_KEY: str({
    default: undefined,
    desc: 'Default Stremio Jackett TMDB API key',
  }),
  DEFAULT_STREMIO_JACKETT_TIMEOUT: num({
    default: undefined,
    desc: 'Default Stremio Jackett timeout',
  }),
  DEFAULT_STREMIO_JACKETT_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Stremio Jackett user agent',
  }),

  // Torrentio settings
  TORRENTIO_URL: url({
    default: 'https://torrentio.strem.fun/',
    desc: 'Torrentio URL',
  }),
  DEFAULT_TORRENTIO_TIMEOUT: num({
    default: undefined,
    desc: 'Default Torrentio timeout',
  }),
  DEFAULT_TORRENTIO_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Torrentio user agent',
  }),

  // Orion settings
  ORION_STREMIO_ADDON_URL: url({
    default: 'https://5a0d1888fa64-orion.baby-beamup.club/',
    desc: 'Orion Stremio addon URL',
  }),
  DEFAULT_ORION_TIMEOUT: num({
    default: undefined,
    desc: 'Default Orion timeout',
  }),
  DEFAULT_ORION_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Orion user agent',
  }),

  // Peerflix settings
  PEERFLIX_URL: url({
    default: 'https://peerflix-addon.onrender.com/',
    desc: 'Peerflix URL',
  }),
  DEFAULT_PEERFLIX_TIMEOUT: num({
    default: undefined,
    desc: 'Default Peerflix timeout',
  }),
  DEFAULT_PEERFLIX_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Peerflix user agent',
  }),

  // Torbox settings
  TORBOX_STREMIO_URL: url({
    default: 'https://stremio.torbox.app/',
    desc: 'Torbox Stremio URL',
  }),
  DEFAULT_TORBOX_TIMEOUT: num({
    default: undefined,
    desc: 'Default Torbox timeout',
  }),
  DEFAULT_TORBOX_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Torbox user agent',
  }),

  // Easynews settings
  EASYNEWS_URL: url({
    default: 'https://ea627ddf0ee7-easynews.baby-beamup.club/',
    desc: 'Easynews URL',
  }),
  DEFAULT_EASYNEWS_TIMEOUT: num({
    default: undefined,
    desc: 'Default Easynews timeout',
  }),
  DEFAULT_EASYNEWS_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Easynews user agent',
  }),

  // Easynews+ settings
  EASYNEWS_PLUS_URL: url({
    default: 'https://b89262c192b0-stremio-easynews-addon.baby-beamup.club/',
    desc: 'Easynews+ URL',
  }),
  DEFAULT_EASYNEWS_PLUS_TIMEOUT: num({
    default: undefined,
    desc: 'Default Easynews+ timeout',
  }),
  DEFAULT_EASYNEWS_PLUS_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Easynews+ user agent',
  }),

  // Easynews++ settings
  EASYNEWS_PLUS_PLUS_URL: url({
    default: 'https://easynews-cloudflare-worker.jqrw92fchz.workers.dev/',
    desc: 'Easynews++ URL',
  }),
  EASYNEWS_PLUS_PLUS_PUBLIC_URL: url({
    default: undefined,
    desc: 'Easynews++ public URL',
  }),
  DEFAULT_EASYNEWS_PLUS_PLUS_TIMEOUT: num({
    default: undefined,
    desc: 'Default Easynews++ timeout',
  }),
  DEFAULT_EASYNEWS_PLUS_PLUS_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Easynews++ user agent',
  }),

  // Debridio Settings
  DEBRIDIO_URL: url({
    default: 'https://debridio.adobotec.com/',
    desc: 'Debridio URL',
  }),
  DEFAULT_DEBRIDIO_TIMEOUT: num({
    default: undefined,
    desc: 'Default Debridio timeout',
  }),
  DEFAULT_DEBRIDIO_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default Debridio user agent',
  }),

  // StremThru Store settings
  STREMTHRU_STORE_URL: url({
    default: 'https://stremthru.elfhosted.com/stremio/store/',
    desc: 'StremThru Store URL',
  }),
  DEFAULT_STREMTHRU_STORE_TIMEOUT: num({
    default: undefined,
    desc: 'Default StremThru Store timeout',
  }),
  DEFAULT_STREMTHRU_STORE_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default StremThru Store user agent',
  }),

  // DMM Cast settings
  DEFAULT_DMM_CAST_TIMEOUT: num({
    default: undefined,
    desc: 'Default DMM Cast timeout',
  }),
  DEFAULT_DMM_CAST_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default DMM Cast user agent',
  }),
  // GDrive settings
  DEFAULT_GDRIVE_TIMEOUT: num({
    default: undefined,
    desc: 'Default GDrive timeout',
  }),
  DEFAULT_GDRIVE_USER_AGENT: userAgent({
    default: undefined,
    desc: 'Default GDrive user agent',
  }),
  // StreamFusion settings
  STREAMFUSION_URL: url({
    default: 'https://stream-fusion.stremiofr.com/',
    desc: 'StreamFusion URL',
  }),
  DEFAULT_STREAMFUSION_TIMEOUT: num({
    default: undefined,
    desc: 'Default StreamFusion timeout',
  }),
});
