const createRegex = (pattern: string): RegExp =>
  new RegExp(`(?<![^\\s\\[(_\\-.,])(${pattern})(?=[\\s\\)\\]_.\\-,]|$)`, 'i');

const createLanguageRegex = (pattern: string): RegExp =>
  createRegex(`${pattern}(?![ .\\-_]?sub(title)?s?)`);

export const PARSE_REGEX = {
  resolutions: {
    '2160p': createRegex(
      '(bd|hd|m)?(4k|2160(p|i)?)|u(ltra)?[ .\\-_]?hd|3840\s?x\s?(\d{4})'
    ),
    '1440p': createRegex(
      '(bd|hd|m)?(1440(p|i)?)|2k|w?q(uad)?[ .\\-_]?hd|2560\s?x(\d{4})'
    ),
    '1080p': createRegex(
      '(bd|hd|m)?(1080(p|i)?)|f(ull)?[ .\\-_]?hd|1920\s?x\s?(\d{3,4})'
    ),
    '720p': createRegex('(bd|hd|m)?(720(p|i)?)|hd|1280\s?x\s?(\d{3,4})'),
    '480p': createRegex('(bd|hd|m)?(480(p|i)?)|sd'),
  },
  qualities: {
    'BluRay REMUX':
      /((?<=remux.*)[ .\-_](blu[ .\-_]?ray))|((blu[ .\-_]?ray)[ .\-_](?=.*remux))|((?<![^\s\[(_\-.,])(bd|br|b|uhd)[ .\\-_]?remux(?=\s\)\]_.\-,]|$))/i,
    BluRay: createRegex(
      'blu[ .\\-_]?ray|((bd|br|b)[ .\\-_]?(rip|r)?)(?![ .\\-_]?remux)'
    ),
    'WEB-DL': createRegex('web[ .\\-_]?(dl)?(?![ .\\-_]?(DLRip|cam))'),
    WEBRip: createRegex('web[ .\\-_]?rip'),
    HDRip: createRegex('hd[ .\\-_]?rip|web[ .\\-_]?dl[ .\\-_]?rip'),
    'HC HD-Rip': createRegex('hc|hd[ .\\-_]?rip'),
    DVDRip: createRegex('dvd[ .\\-_]?(rip|mux|r|full|5|9)'),
    HDTV: createRegex(
      '(hd|pd)tv|tv[ .\\-_]?rip|hdtv[ .\\-_]?rip|dsr(ip)?|sat[ .\\-_]?rip'
    ),
    CAM: createRegex('cam|hdcam|cam[ .\\-_]?rip'),
    TS: createRegex('telesync|ts|hd[ .\\-_]?ts|pdvd|predvd(rip)?'),
    TC: createRegex('telecine|tc|hd[ .\\-_]?tc'),
    SCR: createRegex('((dvd|bd|web|hd)?[ .\\-_]?)?(scr(eener)?)'),
  },
  visualTags: {
    '10bit': createRegex('10[ .\\-_]?bit'),
    'HDR10+': createRegex('hdr[ .\\-_]?10[ .\\-_]?(plus|[+])'),
    HDR10: createRegex('hdr[ .\\-_]?10(?![ .\\-_]?(?:\\+|plus))'),
    HDR: createRegex('hdr(?![ .\\-_]?10)(?![ .\\-_]?(?:\\+|plus))'),
    DV: createRegex('do?(lby)?[ .\\-_]?vi?(sion)?(?:[ .\\-_]?atmos)?|dv'),
    '3D': createRegex('(bd)?(3|three)[ .\\-_]?(d(imension)?(al)?)'),
    IMAX: createRegex('imax'),
    AI: createRegex('ai[ .\\-_]?(upscale|enhanced|remaster)?'),
    SDR: createRegex('sdr'),
  },
  audioTags: {
    Atmos: createRegex('atmos'),
    'DD+': createRegex(
      '(d(olby)?[ .\\-_]?d(igital)?[ .\\-_]?(p(lus)?|\\+)(?:[ .\\-_]?(5[ .\\-_]?1|7[ .\\-_]?1))?)|e[ .\\-_]?ac[ .\\-_]?3'
    ),
    DD: createRegex(
      '(d(olby)?[ .\\-_]?d(igital)?(?:[ .\\-_]?(5[ .\\-_]?1|7[ .\\-_]?1))?)|(?<!e[ .\\-_]?)ac[ .\\-_]?3'
    ),
    'DTS-HD MA': createRegex('dts[ .\\-_]?hd[ .\\-_]?ma'),
    'DTS-HD': createRegex('dts[ .\\-_]?hd(?![ .\\-_]?ma)'),
    DTS: createRegex('dts(?![ .\\-_]?hd[ .\\-_]?ma|[ .\\-_]?hd)'),
    TrueHD: createRegex('true[ .\\-_]?hd'),
    5.1: createRegex(
      '(d(olby)?[ .\\-_]?d(igital)?[ .\\-_]?(p(lus)?|\\+)?)?5[ .\\-_]?1(ch)?'
    ),
    7.1: createRegex(
      '(d(olby)?[ .\\-_]?d(igital)?[ .\\-_]?(p(lus)?|\\+)?)?7[ .\\-_]?1(ch)?'
    ),
    AAC: createRegex('q?aac(?:[ .\\-_]?2)?'),
    FLAC: createRegex('flac(?:[ .\\-_]?(lossless|2\\.0|x[2-4]))?'),
  },
  encodes: {
    HEVC: createRegex('hevc[ .\\-_]?(10)?|[xh][ .\\-_]?265'),
    AVC: createRegex('avc|[xh][ .\\-_]?264'),
    AV1: createRegex('av1'),
    Xvid: createRegex('xvid'),
    DivX: createRegex('divx|dvix'),
    'H-OU': createRegex('h?(alf)?[ .\\-_]?(ou|over[ .\\-_]?under)'),
    'H-SBS': createRegex('h?(alf)?[ .\\-_]?(sbs|side[ .\\-_]?by[ .\\-_]?side)'),
  },
  languages: {
    Multi: createLanguageRegex('multi'),
    'Dual Audio': createLanguageRegex(
      'dual[ .\\-_]?(audio|lang(uage)?|flac|ac3|aac2?)'
    ),
    Dubbed: createLanguageRegex('dub(bed)?'),
    English: createLanguageRegex('english|eng'),
    Japanese: createLanguageRegex('japanese|jap'),
    Chinese: createLanguageRegex('chinese|chi'),
    Russian: createLanguageRegex('russian|rus'),
    Arabic: createLanguageRegex('arabic|ara'),
    Portuguese: createLanguageRegex('portuguese|por'),
    Spanish: createLanguageRegex('spanish|spa|esp'),
    French: createLanguageRegex('french|fra|fr|vf|vff|vfi|vf2|vfq|truefrench'),
    German: createLanguageRegex('german|ger'),
    Italian: createLanguageRegex('italian|ita'),
    Korean: createLanguageRegex('korean|kor'),
    Hindi: createLanguageRegex('hindi|hin'),
    Bengali: createLanguageRegex('bengali|ben'),
    Punjabi: createLanguageRegex('punjabi|pan'),
    Marathi: createLanguageRegex('marathi|mar'),
    Gujarati: createLanguageRegex('gujarati|guj'),
    Tamil: createLanguageRegex('tamil|tam'),
    Telugu: createLanguageRegex('telugu|tel'),
    Kannada: createLanguageRegex('kannada|kan'),
    Malayalam: createLanguageRegex('malayalam|mal'),
    Thai: createLanguageRegex('thai|tha'),
    Vietnamese: createLanguageRegex('vietnamese|vie'),
    Indonesian: createLanguageRegex('indonesian|ind'),
    Turkish: createLanguageRegex('turkish|tur'),
    Hebrew: createLanguageRegex('hebrew|heb'),
    Persian: createLanguageRegex('persian|per'),
    Ukrainian: createLanguageRegex('ukrainian|ukr'),
    Greek: createLanguageRegex('greek|ell'),
    Lithuanian: createLanguageRegex('lithuanian|lit'),
    Latvian: createLanguageRegex('latvian|lav'),
    Estonian: createLanguageRegex('estonian|est'),
    Polish: createLanguageRegex('polish|pol'),
    Czech: createLanguageRegex('czech|cze'),
    Slovak: createLanguageRegex('slovak|slo'),
    Hungarian: createLanguageRegex('hungarian|hun'),
    Romanian: createLanguageRegex('romanian|rum'),
    Bulgarian: createLanguageRegex('bulgarian|bul'),
    Serbian: createLanguageRegex('serbian|srp'),
    Croatian: createLanguageRegex('croatian|hrv'),
    Slovenian: createLanguageRegex('slovenian|slv'),
    Dutch: createLanguageRegex('dutch|dut'),
    Danish: createLanguageRegex('danish|dan'),
    Finnish: createLanguageRegex('finnish|fin'),
    Swedish: createLanguageRegex('swedish|swe'),
    Norwegian: createLanguageRegex('norwegian|nor'),
    Malay: createLanguageRegex('malay'),
    Latino: createLanguageRegex('latino|lat'),
  },
  releaseGroup:
    /- ?(?!\d+$|S\d+|\d+x|ep?\d+|[^[]+]$)([^\-. []+[^\-. [)\]\d][^\-. [)\]]*)(?:\[[\w.-]+])?(?=\.\w{2,4}$|$)/i,
};
