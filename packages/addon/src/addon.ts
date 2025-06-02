import {
  BaseWrapper,
  getCometStreams,
  getDebridioStreams,
  getDMMCastStreams,
  getEasynewsPlusPlusStreams,
  getEasynewsPlusStreams,
  getEasynewsStreams,
  getJackettioStreams,
  getMediafusionStreams,
  getOrionStreams,
  getPeerflixStreams,
  getStremioJackettStreams,
  getStremThruStoreStreams,
  getTorboxStreams,
  getTorrentioStreams,
  getStreamFusionStreams,
} from '@aiostreams/wrappers';
import {
  Stream,
  ParsedStream,
  StreamRequest,
  Config,
  ErrorStream,
} from '@aiostreams/types';
import {
  gdriveFormat,
  torrentioFormat,
  torboxFormat,
  imposterFormat,
  customFormat,
} from '@aiostreams/formatters';
import {
  addonDetails,
  getMediaFlowConfig,
  getMediaFlowPublicIp,
  getTimeTakenSincePoint,
  Settings,
  createLogger,
  generateMediaFlowStreams,
  getStremThruConfig,
  getStremThruPublicIp,
  generateStremThruStreams,
  safeRegexTest,
  compileRegex,
  formRegexFromKeywords,
} from '@aiostreams/utils';
import { errorStream } from './responses';
import { isMatch } from 'super-regex';

const logger = createLogger('addon');

export class AIOStreams {
  private config: Config;

  constructor(config: any) {
    this.config = config;
  }

  private async retryGetIp<T>(
    getter: () => Promise<T | null>,
    label: string,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await getter();
      if (result) {
        return result;
      }
      logger.warn(
        `Failed to get ${label}, retrying... (${attempt}/${maxRetries})`
      );
    }
    throw new Error(`Failed to get ${label} after ${maxRetries} attempts`);
  }

  private async getRequestingIp() {
    let userIp = this.config.requestingIp;
    const PRIVATE_IP_REGEX =
      /^(::1|::ffff:(10|127|192|172)\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})|10\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})|127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})|192\.168\.(\d{1,3})\.(\d{1,3})|172\.(1[6-9]|2[0-9]|3[0-1])\.(\d{1,3})\.(\d{1,3}))$/;

    if (userIp && PRIVATE_IP_REGEX.test(userIp)) {
      userIp = undefined;
    }
    const mediaflowConfig = getMediaFlowConfig(this.config);
    const stremThruConfig = getStremThruConfig(this.config);
    if (mediaflowConfig.mediaFlowEnabled) {
      userIp = await this.retryGetIp(
        () => getMediaFlowPublicIp(mediaflowConfig),
        'MediaFlow public IP'
      );
    } else if (stremThruConfig.stremThruEnabled) {
      userIp = await this.retryGetIp(
        () => getStremThruPublicIp(stremThruConfig),
        'StremThru public IP'
      );
    }
    return userIp;
  }

  public async getStreams(streamRequest: StreamRequest): Promise<Stream[]> {
    const streams: Stream[] = [];
    const startTime = new Date().getTime();

    try {
      this.config.requestingIp = await this.getRequestingIp();
    } catch (error) {
      logger.error(error);
      return [errorStream(`Failed to get Proxy IP`)];
    }

    const { parsedStreams, errorStreams } =
      await this.getParsedStreams(streamRequest);

    const skipReasons = {
      excludeLanguages: 0,
      excludeResolutions: 0,
      excludeQualities: 0,
      excludeEncodes: 0,
      excludeAudioTags: 0,
      excludeVisualTags: 0,
      excludeStreamTypes: 0,
      excludeUncached: 0,
      sizeFilters: 0,
      duplicateStreams: 0,
      streamLimiters: 0,
      excludeRegex: 0,
      requiredRegex: 0,
    };

    logger.info(
      `Got ${parsedStreams.length} parsed streams and ${errorStreams.length} error streams in ${getTimeTakenSincePoint(startTime)}`
    );

    const excludeRegexPattern = this.config.apiKey
      ? this.config.regexFilters?.excludePattern ||
        Settings.DEFAULT_REGEX_EXCLUDE_PATTERN
      : undefined;
    const excludeRegex = excludeRegexPattern
      ? compileRegex(excludeRegexPattern, 'i')
      : undefined;

    const excludeKeywordsRegex = this.config.excludeFilters
      ? formRegexFromKeywords(this.config.excludeFilters)
      : undefined;

    const requiredRegexPattern = this.config.apiKey
      ? this.config.regexFilters?.includePattern ||
        Settings.DEFAULT_REGEX_INCLUDE_PATTERN
      : undefined;
    const requiredRegex = requiredRegexPattern
      ? compileRegex(requiredRegexPattern, 'i')
      : undefined;

    const requiredKeywordsRegex = this.config.strictIncludeFilters
      ? formRegexFromKeywords(this.config.strictIncludeFilters)
      : undefined;

    const sortRegexPatterns = this.config.apiKey
      ? this.config.regexSortPatterns || Settings.DEFAULT_REGEX_SORT_PATTERNS
      : undefined;

    const sortRegexes: { name?: string; regex: RegExp }[] | undefined =
      sortRegexPatterns
        ? sortRegexPatterns
            .split(/\s+/)
            .filter(Boolean)
            .map((pattern) => {
              const delimiter = '<::>';
              const delimiterIndex = pattern.indexOf(delimiter);
              if (delimiterIndex !== -1) {
                const name = pattern
                  .slice(0, delimiterIndex)
                  .replace(/_/g, ' ');
                const regexPattern = pattern.slice(
                  delimiterIndex + delimiter.length
                );

                const regex = compileRegex(regexPattern, 'i');
                return { name, regex };
              }
              return { regex: compileRegex(pattern, 'i') };
            })
        : undefined;

    excludeRegex ||
    excludeKeywordsRegex ||
    requiredRegex ||
    requiredKeywordsRegex ||
    sortRegexes
      ? logger.debug(
          `The following regex patterns are being used:\n` +
            `Exclude Regex: ${excludeRegex}\n` +
            `Exclude Keywords: ${excludeKeywordsRegex}\n` +
            `Required Regex: ${requiredRegex}\n` +
            `Required Keywords: ${requiredKeywordsRegex}\n` +
            `Sort Regexes: ${sortRegexes?.map((regex) => `${regex.name || 'Unnamed'}: ${regex.regex}`).join(' --> ')}\n`
        )
      : [];

    const filterStartTime = new Date().getTime();

    let filteredResults = parsedStreams.filter((parsedStream) => {
      const streamTypeFilter = this.config.streamTypes?.find(
        (streamType) => streamType[parsedStream.type] === false
      );
      if (this.config.streamTypes && streamTypeFilter) {
        skipReasons.excludeStreamTypes++;
        return false;
      }

      const resolutionFilter = this.config.resolutions?.find(
        (resolution) => resolution[parsedStream.resolution] === false
      );
      if (resolutionFilter) {
        skipReasons.excludeResolutions++;
        return false;
      }

      const qualityFilter = this.config.qualities?.find(
        (quality) => quality[parsedStream.quality] === false
      );
      if (this.config.qualities && qualityFilter) {
        skipReasons.excludeQualities++;
        return false;
      }

      // Check for HDR and DV tags in the parsed stream
      const hasHDR = parsedStream.visualTags.some((tag) =>
        tag.startsWith('HDR')
      );
      const hasDV = parsedStream.visualTags.includes('DV');
      const hasHDRAndDV = hasHDR && hasDV;
      const HDRAndDVEnabled = this.config.visualTags.some(
        (visualTag) => visualTag['HDR+DV'] === true
      );

      const isTagDisabled = (tag: string) =>
        this.config.visualTags.some((visualTag) => visualTag[tag] === false);

      if (hasHDRAndDV) {
        if (!HDRAndDVEnabled) {
          skipReasons.excludeVisualTags++;
          return false;
        }
      } else if (hasHDR) {
        const specificHdrTags = parsedStream.visualTags.filter((tag) =>
          tag.startsWith('HDR')
        );
        const disabledTags = specificHdrTags.filter(
          (tag) => isTagDisabled(tag) === true
        );
        if (disabledTags.length > 0) {
          skipReasons.excludeVisualTags++;
          return;
        }
      } else if (hasDV && isTagDisabled('DV')) {
        skipReasons.excludeVisualTags++;
        return false;
      }

      // Check other visual tags for explicit disabling
      for (const tag of parsedStream.visualTags) {
        if (tag.startsWith('HDR') || tag === 'DV') continue;
        if (isTagDisabled(tag)) {
          skipReasons.excludeVisualTags++;
          return false;
        }
      }

      // apply excludedLanguages filter
      const excludedLanguages = this.config.excludedLanguages;
      if (excludedLanguages && parsedStream.languages.length > 0) {
        if (
          parsedStream.languages.every((lang) =>
            excludedLanguages.includes(lang)
          )
        ) {
          skipReasons.excludeLanguages++;
          return false;
        }
      } else if (
        excludedLanguages &&
        excludedLanguages.includes('Unknown') &&
        parsedStream.languages.length === 0
      ) {
        skipReasons.excludeLanguages++;
        return false;
      }

      const audioTagFilter = parsedStream.audioTags.find((tag) =>
        this.config.audioTags.some((audioTag) => audioTag[tag] === false)
      );
      if (audioTagFilter) {
        skipReasons.excludeAudioTags++;
        return false;
      }

      if (
        parsedStream.encode &&
        this.config.encodes.some(
          (encode) => encode[parsedStream.encode] === false
        )
      ) {
        skipReasons.excludeEncodes++;
        return false;
      }

      if (
        this.config.onlyShowCachedStreams &&
        parsedStream.provider &&
        !parsedStream.provider.cached
      ) {
        skipReasons.excludeUncached++;
        return false;
      }

      if (
        this.config.minSize &&
        parsedStream.size &&
        parsedStream.size < this.config.minSize
      ) {
        skipReasons.sizeFilters++;
        return false;
      }

      if (
        this.config.maxSize &&
        parsedStream.size &&
        parsedStream.size > this.config.maxSize
      ) {
        skipReasons.sizeFilters++;
        return false;
      }

      if (
        streamRequest.type === 'movie' &&
        this.config.maxMovieSize &&
        parsedStream.size &&
        parsedStream.size > this.config.maxMovieSize
      ) {
        skipReasons.sizeFilters++;
        return false;
      }

      if (
        streamRequest.type === 'movie' &&
        this.config.minMovieSize &&
        parsedStream.size &&
        parsedStream.size < this.config.minMovieSize
      ) {
        skipReasons.sizeFilters++;
        return false;
      }

      if (
        streamRequest.type === 'series' &&
        this.config.maxEpisodeSize &&
        parsedStream.size &&
        parsedStream.size > this.config.maxEpisodeSize
      ) {
        skipReasons.sizeFilters++;
        return false;
      }

      if (
        streamRequest.type === 'series' &&
        this.config.minEpisodeSize &&
        parsedStream.size &&
        parsedStream.size < this.config.minEpisodeSize
      ) {
        skipReasons.sizeFilters++;
        return false;
      }

      // generate array of excludeTests. for each regex, only add to array if the filename or indexers are defined
      let excludeTests: (boolean | null)[] = [];
      let requiredTests: (boolean | null)[] = [];

      const addToTests = (field: string | undefined) => {
        if (field) {
          excludeTests.push(
            excludeRegex ? safeRegexTest(excludeRegex, field) : null,
            excludeKeywordsRegex
              ? safeRegexTest(excludeKeywordsRegex, field)
              : null
          );
          requiredTests.push(
            requiredRegex ? safeRegexTest(requiredRegex, field) : null,
            requiredKeywordsRegex
              ? safeRegexTest(requiredKeywordsRegex, field)
              : null
          );
        }
      };

      addToTests(parsedStream.filename);
      addToTests(parsedStream.folderName);
      addToTests(parsedStream.indexers);

      // filter out any null values as these are when the regex is not defined
      excludeTests = excludeTests.filter((test) => test !== null);
      requiredTests = requiredTests.filter((test) => test !== null);

      if (excludeTests.length > 0 && excludeTests.some((test) => test)) {
        skipReasons.excludeRegex++;
        return false;
      }

      if (requiredTests.length > 0 && !requiredTests.some((test) => test)) {
        skipReasons.requiredRegex++;
        return false;
      }

      return true;
    });

    logger.info(
      `Initial filter to ${filteredResults.length} streams in ${getTimeTakenSincePoint(filterStartTime)}`
    );

    if (this.config.cleanResults) {
      const cleanedStreams: ParsedStream[] = [];
      const initialStreams = filteredResults;
      const normaliseFilename = (filename?: string): string | undefined =>
        filename
          ? filename
              ?.replace(
                /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|3gp|3g2|m2ts|ts|vob|ogv|ogm|divx|xvid|rm|rmvb|asf|mxf|mka|mks|mk3d|webm|f4v|f4p|f4a|f4b)$/i,
                ''
              )
              .replace(/[^\p{L}\p{N}+]/gu, '')
              .replace(/\s+/g, '')
              .toLowerCase()
          : undefined;

      const groupStreamsByKey = (
        streams: ParsedStream[],
        keyExtractor: (stream: ParsedStream) => string | undefined
      ): Record<string, ParsedStream[]> => {
        return streams.reduce(
          (acc, stream) => {
            const key = keyExtractor(stream);
            if (!key) {
              if (!cleanedStreams.includes(stream)) {
                cleanedStreams.push(stream);
              }
              return acc;
            }
            acc[key] = acc[key] || [];
            acc[key].push(stream);
            return acc;
          },
          {} as Record<string, ParsedStream[]>
        );
      };

      const cleanResultsStartTime = new Date().getTime();
      // Deduplication by normalised filename
      const cleanResultsByFilenameStartTime = new Date().getTime();
      logger.info(`Received ${initialStreams.length} streams to clean`);
      const streamsGroupedByFilename = groupStreamsByKey(
        initialStreams,
        (stream) => normaliseFilename(stream.filename)
      );

      logger.info(
        `Found ${Object.keys(streamsGroupedByFilename).length} unique filenames with ${
          initialStreams.length -
          Object.values(streamsGroupedByFilename).reduce(
            (sum, group) => sum + group.length,
            0
          )
        } streams not grouped`
      );

      // Process grouped streams by filename
      const cleanedStreamsByFilename = await this.processGroupedStreams(
        streamsGroupedByFilename
      );

      logger.info(
        `Deduplicated streams by filename to ${cleanedStreamsByFilename.length} streams in ${getTimeTakenSincePoint(cleanResultsByFilenameStartTime)}`
      );

      // Deduplication by hash
      const cleanResultsByHashStartTime = new Date().getTime();

      const streamsGroupedByHash = groupStreamsByKey(
        cleanedStreamsByFilename,
        (stream) => stream._infoHash
      );
      logger.info(
        `Found ${Object.keys(streamsGroupedByHash).length} unique hashes with ${cleanedStreamsByFilename.length - Object.values(streamsGroupedByHash).reduce((sum, group) => sum + group.length, 0)} streams not grouped`
      );

      // Process grouped streams by hash
      const cleanedStreamsByHash =
        await this.processGroupedStreams(streamsGroupedByHash);

      logger.info(
        `Deduplicated streams by hash to ${cleanedStreamsByHash.length} streams in ${getTimeTakenSincePoint(cleanResultsByHashStartTime)}`
      );

      cleanedStreams.push(...cleanedStreamsByHash);
      logger.info(
        `Deduplicated streams to ${cleanedStreams.length} streams in ${getTimeTakenSincePoint(cleanResultsStartTime)}`
      );
      skipReasons.duplicateStreams =
        filteredResults.length - cleanedStreams.length;
      filteredResults = cleanedStreams;
    }
    // pre compute highest indexes for regexSortPatterns
    const startPrecomputeTime = new Date().getTime();
    filteredResults.forEach((stream: ParsedStream) => {
      if (sortRegexes) {
        for (let i = 0; i < sortRegexes.length; i++) {
          if (!stream.filename && !stream.folderName) continue;
          const regex = sortRegexes[i];
          if (
            (stream.filename && isMatch(regex.regex, stream.filename)) ||
            (stream.folderName && isMatch(regex.regex, stream.folderName))
          ) {
            stream.regexMatched = {
              name: regex.name,
              pattern: regex.regex.source,
              index: i,
            };
            break;
          }
        }
      }
    });
    logger.info(
      `Precomputed sortRegex indexes for ${filteredResults.length} streams in ${getTimeTakenSincePoint(
        startPrecomputeTime
      )}`
    );
    // Apply sorting
    const sortStartTime = new Date().getTime();
    // initially sort by filename to ensure consistent results
    filteredResults.sort((a, b) =>
      a.filename && b.filename ? a.filename.localeCompare(b.filename) : 0
    );

    // then apply our this.config sorting
    filteredResults.sort((a, b) => {
      for (const sortByField of this.config.sortBy) {
        const field = Object.keys(sortByField).find(
          (key) => typeof sortByField[key] === 'boolean'
        );
        if (!field) continue;
        const value = sortByField[field];

        if (value) {
          const fieldComparison = this.compareByField(a, b, field);
          if (fieldComparison !== 0) return fieldComparison;
        }
      }

      return 0;
    });

    logger.info(`Sorted results in ${getTimeTakenSincePoint(sortStartTime)}`);

    // apply config.maxResultsPerResolution
    if (this.config.maxResultsPerResolution) {
      const startTime = new Date().getTime();
      const resolutionCounts = new Map();

      const limitedResults = filteredResults.filter((result) => {
        const resolution = result.resolution || 'Unknown';
        const currentCount = resolutionCounts.get(resolution) || 0;

        if (currentCount < this.config.maxResultsPerResolution!) {
          resolutionCounts.set(resolution, currentCount + 1);
          return true;
        }

        return false;
      });
      skipReasons.streamLimiters =
        filteredResults.length - limitedResults.length;
      filteredResults = limitedResults;

      logger.info(
        `Limited results to ${limitedResults.length} streams after applying maxResultsPerResolution in ${new Date().getTime() - startTime}ms`
      );
    }

    const totalSkipped = Object.values(skipReasons).reduce(
      (acc, val) => acc + val,
      0
    );
    const reportLines = [
      '╔═══════════════════════╤════════════╗',
      '║ Skip Reason           │ Count      ║',
      '╟───────────────────────┼────────────╢',
      ...Object.entries(skipReasons)
        .filter(([reason, count]) => count > 0)
        .map(
          ([reason, count]) =>
            `║ ${reason.padEnd(21)} │ ${String(count).padStart(10)} ║`
        ),
      '╟───────────────────────┼────────────╢',
      `║ Total Skipped         │ ${String(totalSkipped).padStart(10)} ║`,
      '╚═══════════════════════╧════════════╝',
    ];

    if (totalSkipped > 0) logger.info('\n' + reportLines.join('\n'));

    // Create stream objects
    const streamsStartTime = new Date().getTime();
    const streamObjects = await this.createStreamObjects(filteredResults);
    streams.push(...streamObjects.filter((s) => s !== null));

    // Add error streams to the end
    streams.push(
      ...errorStreams.map((e) => errorStream(e.error, e.addon.name))
    );

    logger.info(
      `Created ${streams.length} stream objects in ${getTimeTakenSincePoint(streamsStartTime)}`
    );
    logger.info(
      `Total time taken to get streams: ${getTimeTakenSincePoint(startTime)}`
    );
    return streams;
  }

  private shouldProxyStream(
    stream: ParsedStream,
    mediaFlowConfig: ReturnType<typeof getMediaFlowConfig>,
    stremThruConfig: ReturnType<typeof getStremThruConfig>
  ): boolean {
    if (!stream.url) return false;

    const streamProvider = stream.provider ? stream.provider.id : 'none';

    // // now check if mediaFlowConfig.proxiedAddons or mediaFlowConfig.proxiedServices is not null
    // logger.info(this.config.mediaFlowConfig?.proxiedAddons);
    // logger.info(stream.addon.id);
    if (
      mediaFlowConfig.mediaFlowEnabled &&
      (!mediaFlowConfig.proxiedAddons?.length ||
        mediaFlowConfig.proxiedAddons.includes(stream.addon.id)) &&
      (!mediaFlowConfig.proxiedServices?.length ||
        mediaFlowConfig.proxiedServices.includes(streamProvider))
    ) {
      return true;
    }

    if (
      stremThruConfig.stremThruEnabled &&
      (!stremThruConfig.proxiedAddons?.length ||
        stremThruConfig.proxiedAddons.includes(stream.addon.id)) &&
      (!stremThruConfig.proxiedServices?.length ||
        stremThruConfig.proxiedServices.includes(streamProvider))
    ) {
      return true;
    }

    return false;
  }

  private getFormattedText(parsedStream: ParsedStream): {
    name: string;
    description: string;
  } {
    switch (this.config.formatter) {
      case 'gdrive': {
        return gdriveFormat(parsedStream, false);
      }
      case 'minimalistic-gdrive': {
        return gdriveFormat(parsedStream, true);
      }
      case 'imposter': {
        return imposterFormat(parsedStream);
      }
      case 'torrentio': {
        return torrentioFormat(parsedStream);
      }
      case 'torbox': {
        return torboxFormat(parsedStream);
      }
      default: {
        if (
          this.config.formatter.startsWith('custom:') &&
          this.config.formatter.length > 7
        ) {
          const jsonString = this.config.formatter.slice(7);
          const formatter = JSON.parse(jsonString);
          if (formatter.name && formatter.description) {
            try {
              return customFormat(parsedStream, formatter);
            } catch (error: any) {
              logger.error(
                `Error in custom formatter: ${error.message || error}, falling back to default formatter`
              );
              return gdriveFormat(parsedStream, false);
            }
          }
        }

        return gdriveFormat(parsedStream, false);
      }
    }
  }

  private async createStreamObjects(
    parsedStreams: ParsedStream[]
  ): Promise<Stream[]> {
    const mediaFlowConfig = getMediaFlowConfig(this.config);
    const stremThruConfig = getStremThruConfig(this.config);

    // Identify streams that require proxying
    const streamsToProxy = parsedStreams
      .map((stream, index) => ({ stream, index }))
      .filter(
        ({ stream }) =>
          stream.url &&
          this.shouldProxyStream(stream, mediaFlowConfig, stremThruConfig)
      );

    const proxiedUrls = streamsToProxy.length
      ? mediaFlowConfig.mediaFlowEnabled
        ? await generateMediaFlowStreams(
            mediaFlowConfig,
            streamsToProxy.map(({ stream }) => ({
              url: stream.url!,
              filename: stream.filename,
              headers: stream.stream?.behaviorHints?.proxyHeaders,
            }))
          )
        : stremThruConfig.stremThruEnabled
          ? await generateStremThruStreams(
              stremThruConfig,
              streamsToProxy.map(({ stream }) => ({
                url: stream.url!,
                filename: stream.filename,
                headers: stream.stream?.behaviorHints?.proxyHeaders,
              }))
            )
          : null
      : null;

    const removeIndexes = new Set<number>();

    // Apply proxied URLs and mark as proxied
    streamsToProxy.forEach(({ stream, index }, i) => {
      const proxiedUrl = proxiedUrls?.[i];
      if (proxiedUrl) {
        stream.url = proxiedUrl;
        stream.proxied = true;
      } else {
        removeIndexes.add(index);
      }
    });

    // Remove streams that failed to proxy
    if (removeIndexes.size > 0) {
      logger.error(
        `Failed to proxy ${removeIndexes.size} streams, removing them from the final list`
      );
      parsedStreams = parsedStreams.filter(
        (_, index) => !removeIndexes.has(index)
      );
    }

    // Build final Stream objects
    const proxyBingeGroupPrefix = mediaFlowConfig.mediaFlowEnabled
      ? 'mfp.'
      : stremThruConfig.stremThruEnabled
        ? 'st.'
        : '';
    const streamObjects: Stream[] = await Promise.all(
      parsedStreams.map((parsedStream) => {
        const { name, description } = this.getFormattedText(parsedStream);

        const combinedTags = [
          parsedStream.resolution,
          parsedStream.quality,
          parsedStream.encode,
          ...parsedStream.visualTags,
          ...parsedStream.audioTags,
          ...parsedStream.languages,
        ];

        return {
          url: parsedStream.url,
          externalUrl: parsedStream.externalUrl,
          infoHash: parsedStream.torrent?.infoHash,
          fileIdx: parsedStream.torrent?.fileIdx,
          name,
          description,
          subtitles: parsedStream.stream?.subtitles,
          sources: parsedStream.torrent?.sources,
          behaviorHints: {
            videoSize: parsedStream.size
              ? Math.floor(parsedStream.size)
              : undefined,
            filename: parsedStream.filename,
            bingeGroup: `${parsedStream.proxied ? proxyBingeGroupPrefix : ''}${Settings.ADDON_ID}|${parsedStream.addon.name}|${combinedTags.join('|')}`,
            proxyHeaders: parsedStream.stream?.behaviorHints?.proxyHeaders,
            notWebReady: parsedStream.stream?.behaviorHints?.notWebReady,
          },
        };
      })
    );

    return streamObjects;
  }

  private compareLanguages(a: ParsedStream, b: ParsedStream) {
    if (this.config.prioritiseLanguage) {
      const aHasPrioritisedLanguage = a.languages.includes(
        this.config.prioritiseLanguage
      );
      const bHasPrioritisedLanguage = b.languages.includes(
        this.config.prioritiseLanguage
      );

      if (aHasPrioritisedLanguage && !bHasPrioritisedLanguage) return -1;
      if (!aHasPrioritisedLanguage && bHasPrioritisedLanguage) return 1;
    }
    return 0;
  }

  private compareByField(a: ParsedStream, b: ParsedStream, field: string) {
    if (field === 'resolution') {
      return (
        this.config.resolutions.findIndex(
          (resolution) => resolution[a.resolution]
        ) -
        this.config.resolutions.findIndex(
          (resolution) => resolution[b.resolution]
        )
      );
    } else if (field === 'regexSort') {
      const regexSortPatterns =
        this.config.regexSortPatterns || Settings.DEFAULT_REGEX_SORT_PATTERNS;
      if (!regexSortPatterns) return 0;
      try {
        // Get direction once
        const direction = this.config.sortBy.find(
          (sort) => Object.keys(sort)[0] === 'regexSort'
        )?.direction;

        // Early exit if no filename to test
        if (!a.filename && !b.filename) return 0;
        if (!a.filename) return direction === 'asc' ? -1 : 1;
        if (!b.filename) return direction === 'asc' ? 1 : -1;

        const aHighestIndex = a.regexMatched?.index;
        const bHighestIndex = b.regexMatched?.index;

        // If both have a regex match, sort by the highest index
        if (aHighestIndex !== undefined && bHighestIndex !== undefined) {
          return direction === 'asc'
            ? bHighestIndex - aHighestIndex
            : aHighestIndex - bHighestIndex;
        }
        // If one has a regex match and the other doesn't, sort by the one that does
        if (aHighestIndex !== undefined) return direction === 'asc' ? 1 : -1;
        if (bHighestIndex !== undefined) return direction === 'asc' ? -1 : 1;

        // If both have no regex match, they are equal
        return 0;
      } catch (e) {
        return 0;
      }
    } else if (field === 'cached') {
      let aCanbeCached = a.provider;
      let bCanbeCached = b.provider;
      let aCached = a.provider?.cached;
      let bCached = b.provider?.cached;

      // prioritise non debrid/usenet p2p over uncached
      if (aCanbeCached && !bCanbeCached && !aCached) return 1;
      if (!aCanbeCached && bCanbeCached && !bCached) return -1;
      if (aCanbeCached && bCanbeCached) {
        if (aCached === bCached) return 0;
        // prioritise a false value over undefined
        if (aCached === false && bCached === undefined) return -1;
        if (aCached === undefined && bCached === false) return 1;
        return this.config.sortBy.find(
          (sort) => Object.keys(sort)[0] === 'cached'
        )?.direction === 'asc'
          ? aCached
            ? 1
            : -1 // uncached > cached
          : aCached
            ? -1
            : 1; // cached > uncached
      }
    } else if (field === 'personal') {
      // depending on direction, sort by personal or not personal
      const direction = this.config.sortBy.find(
        (sort) => Object.keys(sort)[0] === 'personal'
      )?.direction;
      if (direction === 'asc') {
        // prefer not personal over personal
        return a.personal === b.personal ? 0 : a.personal ? 1 : -1;
      }
      if (direction === 'desc') {
        // prefer personal over not personal
        return a.personal === b.personal ? 0 : a.personal ? -1 : 1;
      }
    } else if (field === 'service') {
      // sort files with providers by name
      let aProvider = a.provider?.id;
      let bProvider = b.provider?.id;

      if (aProvider && bProvider) {
        const aIndex = this.config.services.findIndex(
          (service) => service.id === aProvider
        );
        const bIndex = this.config.services.findIndex(
          (service) => service.id === bProvider
        );
        return aIndex - bIndex;
      }
    } else if (field === 'size') {
      return this.config.sortBy.find((sort) => Object.keys(sort)[0] === 'size')
        ?.direction === 'asc'
        ? (a.size || 0) - (b.size || 0)
        : (b.size || 0) - (a.size || 0);
    } else if (field === 'seeders') {
      if (
        a.torrent?.seeders !== undefined &&
        b.torrent?.seeders !== undefined
      ) {
        return this.config.sortBy.find(
          (sort) => Object.keys(sort)[0] === 'seeders'
        )?.direction === 'asc'
          ? a.torrent.seeders - b.torrent.seeders
          : b.torrent.seeders - a.torrent.seeders;
      } else if (
        a.torrent?.seeders !== undefined &&
        b.torrent?.seeders === undefined
      ) {
        return -1;
      } else if (
        a.torrent?.seeders === undefined &&
        b.torrent?.seeders !== undefined
      ) {
        return 1;
      }
    } else if (field === 'streamType') {
      return (
        (this.config.streamTypes?.findIndex(
          (streamType) => streamType[a.type]
        ) ?? -1) -
        (this.config.streamTypes?.findIndex(
          (streamType) => streamType[b.type]
        ) ?? -1)
      );
    } else if (field === 'quality') {
      return (
        this.config.qualities.findIndex((quality) => quality[a.quality]) -
        this.config.qualities.findIndex((quality) => quality[b.quality])
      );
    } else if (field === 'visualTag') {
      // Find the highest priority visual tag in each file
      const getIndexOfTag = (tag: string) =>
        this.config.visualTags.findIndex((t) => t[tag]);

      const getHighestPriorityTagIndex = (tags: string[]) => {
        // Check if the file contains both any HDR tag and DV
        const hasHDR = tags.some((tag) => tag.startsWith('HDR'));
        const hasDV = tags.includes('DV');

        if (hasHDR && hasDV) {
          // Sort according to the position of the HDR+DV tag
          const hdrDvIndex = this.config.visualTags.findIndex(
            (t) => t['HDR+DV']
          );
          if (hdrDvIndex !== -1) {
            return hdrDvIndex;
          }
        }

        // If the file contains multiple HDR tags, look at the HDR tag that has the highest priority
        const hdrTagIndices = tags
          .filter((tag) => tag.startsWith('HDR'))
          .map((tag) => getIndexOfTag(tag));
        if (hdrTagIndices.length > 0) {
          return Math.min(...hdrTagIndices);
        }

        // Always consider the highest priority visual tag when a file has multiple visual tags
        return tags.reduce(
          (minIndex, tag) => Math.min(minIndex, getIndexOfTag(tag)),
          this.config.visualTags.length
        );
      };

      const aVisualTagIndex = getHighestPriorityTagIndex(a.visualTags);
      const bVisualTagIndex = getHighestPriorityTagIndex(b.visualTags);

      // Sort by the visual tag index
      return aVisualTagIndex - bVisualTagIndex;
    } else if (field === 'audioTag') {
      // Find the highest priority audio tag in each file
      const getIndexOfTag = (tag: string) =>
        this.config.audioTags.findIndex((t) => t[tag]);
      const aAudioTagIndex = a.audioTags.reduce(
        (minIndex, tag) => Math.min(minIndex, getIndexOfTag(tag)),
        this.config.audioTags.length
      );

      const bAudioTagIndex = b.audioTags.reduce(
        (minIndex, tag) => Math.min(minIndex, getIndexOfTag(tag)),
        this.config.audioTags.length
      );
      // Sort by the audio tag index
      return aAudioTagIndex - bAudioTagIndex;
    } else if (field === 'encode') {
      return (
        this.config.encodes.findIndex((encode) => encode[a.encode]) -
        this.config.encodes.findIndex((encode) => encode[b.encode])
      );
    } else if (field === 'addon') {
      const aAddon = a.addon.id;
      const bAddon = b.addon.id;

      const addonIds = this.config.addons.map((addon) => {
        return `${addon.id}-${JSON.stringify(addon.options)}`;
      });
      return addonIds.indexOf(aAddon) - addonIds.indexOf(bAddon);
    } else if (field === 'language') {
      if (this.config.prioritiseLanguage) {
        return this.compareLanguages(a, b);
      }
      if (!this.config.prioritisedLanguages) {
        return 0;
      }
      // else, we look at the array of prioritisedLanguages.
      // any file with a language in the prioritisedLanguages array should be prioritised
      // if both files contain a prioritisedLanguage, we compare the index of the highest priority language

      const aHasPrioritisedLanguage =
        a.languages.some((lang) =>
          this.config.prioritisedLanguages?.includes(lang)
        ) ||
        (a.languages.length === 0 &&
          this.config.prioritisedLanguages?.includes('Unknown'));
      const bHasPrioritisedLanguage =
        b.languages.some((lang) =>
          this.config.prioritisedLanguages?.includes(lang)
        ) ||
        (b.languages.length === 0 &&
          this.config.prioritisedLanguages?.includes('Unknown'));

      if (aHasPrioritisedLanguage && !bHasPrioritisedLanguage) return -1;
      if (!aHasPrioritisedLanguage && bHasPrioritisedLanguage) return 1;

      if (aHasPrioritisedLanguage && bHasPrioritisedLanguage) {
        const getHighestPriorityLanguageIndex = (languages: string[]) => {
          if (languages.length === 0) {
            const unknownIndex =
              this.config.prioritisedLanguages!.indexOf('Unknown');
            return unknownIndex !== -1
              ? unknownIndex
              : this.config.prioritisedLanguages!.length;
          }
          return languages.reduce((minIndex, lang) => {
            const index =
              this.config.prioritisedLanguages?.indexOf(lang) ??
              this.config.prioritisedLanguages!.length;
            return index !== -1 ? Math.min(minIndex, index) : minIndex;
          }, this.config.prioritisedLanguages!.length);
        };

        const aHighestPriorityLanguageIndex = getHighestPriorityLanguageIndex(
          a.languages
        );
        const bHighestPriorityLanguageIndex = getHighestPriorityLanguageIndex(
          b.languages
        );

        return aHighestPriorityLanguageIndex - bHighestPriorityLanguageIndex;
      }
    }
    return 0;
  }

  private async getParsedStreams(
    streamRequest: StreamRequest
  ): Promise<{ parsedStreams: ParsedStream[]; errorStreams: ErrorStream[] }> {
    const parsedStreams: ParsedStream[] = [];
    const errorStreams: ErrorStream[] = [];
    const formatError = (error: string) =>
      typeof error === 'string'
        ? error
            .replace(/- |: /g, '\n')
            .split('\n')
            .map((line: string) => line.trim())
            .join('\n')
            .trim()
        : error;

    const addonPromises = this.config.addons.map(async (addon) => {
      const addonName =
        addon.options.name ||
        addon.options.overrideName ||
        addonDetails.find((addonDetail) => addonDetail.id === addon.id)?.name ||
        addon.id;
      const addonId = `${addon.id}-${JSON.stringify(addon.options)}`;
      try {
        const startTime = new Date().getTime();
        const { addonStreams, addonErrors } = await this.getStreamsFromAddon(
          addon,
          addonId,
          streamRequest
        );
        parsedStreams.push(...addonStreams);
        errorStreams.push(
          ...[...new Set(addonErrors)].map((error) => ({
            error: formatError(error),
            addon: { id: addonId, name: addonName },
          }))
        );
        logger.info(
          `Got ${addonStreams.length} streams ${addonErrors.length > 0 ? `and ${addonErrors.length} errors ` : ''}from addon ${addonName} in ${getTimeTakenSincePoint(startTime)}`
        );
      } catch (error: any) {
        logger.error(`Failed to get streams from ${addonName}: ${error}`);
        errorStreams.push({
          error: formatError(error.message ?? error ?? 'Unknown error'),
          addon: {
            id: addonId,
            name: addonName,
          },
        });
      }
    });

    await Promise.all(addonPromises);
    return { parsedStreams, errorStreams };
  }

  private async getStreamsFromAddon(
    addon: Config['addons'][0],
    addonId: string,
    streamRequest: StreamRequest
  ): Promise<{ addonStreams: ParsedStream[]; addonErrors: string[] }> {
    switch (addon.id) {
      case 'torbox': {
        return await getTorboxStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'torrentio': {
        return await getTorrentioStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'comet': {
        return await getCometStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'mediafusion': {
        return await getMediafusionStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'stremio-jackett': {
        return await getStremioJackettStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'jackettio': {
        return await getJackettioStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'orion-stremio-addon': {
        return await getOrionStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'easynews': {
        return await getEasynewsStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'easynews-plus': {
        return await getEasynewsPlusStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'easynews-plus-plus': {
        return await getEasynewsPlusPlusStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'debridio': {
        return await getDebridioStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'peerflix': {
        return await getPeerflixStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'stremthru-store': {
        return await getStremThruStoreStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'streamfusion': {
        return await getStreamFusionStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'dmm-cast': {
        return await getDMMCastStreams(
          this.config,
          addon.options,
          streamRequest,
          addonId
        );
      }
      case 'gdrive': {
        if (!addon.options.addonUrl) {
          throw new Error('The addon URL was undefined for GDrive');
        }
        const wrapper = new BaseWrapper(
          addon.options.overrideName || 'GDrive',
          addon.options.addonUrl,
          addonId,
          this.config,
          addon.options.indexerTimeout
            ? parseInt(addon.options.indexerTimeout)
            : Settings.DEFAULT_GDRIVE_TIMEOUT
        );
        return await wrapper.getParsedStreams(streamRequest);
      }
      default: {
        if (!addon.options.url) {
          throw new Error(
            `The addon URL was undefined for ${addon.options.name}`
          );
        }
        const wrapper = new BaseWrapper(
          addon.options.name || 'Custom',
          addon.options.url.trim(),
          addonId,
          this.config,
          addon.options.indexerTimeout
            ? parseInt(addon.options.indexerTimeout)
            : undefined
        );
        return wrapper.getParsedStreams(streamRequest);
      }
    }
  }
  private async processGroupedStreams(
    groupedStreams: Record<string, ParsedStream[]>
  ) {
    const uniqueStreams: ParsedStream[] = [];
    Object.values(groupedStreams).forEach((groupedStreams) => {
      if (groupedStreams.length === 1) {
        uniqueStreams.push(groupedStreams[0]);
        return;
      }

      /*logger.info(
        `==================\nDetermining unique streams for ${groupedStreams[0].filename} from ${groupedStreams.length} total duplicates`
      );
      logger.info(
        groupedStreams.map(
          (stream) =>
            `Addon ID: ${stream.addon.id}, Provider ID: ${stream.provider?.id}, Provider Cached: ${stream.provider?.cached}, type: ${stream.torrent ? 'torrent' : 'usenet'}`
        )
      );
      logger.info('==================');*/
      // Separate streams into categories
      const cachedStreams = groupedStreams.filter(
        (stream) => stream.provider?.cached || (!stream.provider && stream.url)
      );
      const uncachedStreams = groupedStreams.filter(
        (stream) => stream.provider && !stream.provider.cached
      );
      const noProviderStreams = groupedStreams.filter(
        (stream) => !stream.provider && stream.torrent?.infoHash
      );

      // Select uncached streams by addon priority (one per provider)
      const selectedUncachedStreams = Object.values(
        uncachedStreams.reduce(
          (acc, stream) => {
            acc[stream.provider!.id] = acc[stream.provider!.id] || [];
            acc[stream.provider!.id].push(stream);
            return acc;
          },
          {} as Record<string, ParsedStream[]>
        )
      ).map((providerGroup) => {
        return providerGroup.sort((a, b) => {
          const aIndex = this.config.addons.findIndex(
            (addon) =>
              `${addon.id}-${JSON.stringify(addon.options)}` === a.addon.id
          );
          const bIndex = this.config.addons.findIndex(
            (addon) =>
              `${addon.id}-${JSON.stringify(addon.options)}` === b.addon.id
          );
          return aIndex - bIndex;
        })[0];
      });
      //selectedUncachedStreams.forEach(stream => logger.info(`Selected uncached stream for provider ${stream.provider!.id}: Addon ID: ${stream.addon.id}`));

      // Select cached streams by provider and addon priority
      const selectedCachedStream = cachedStreams.sort((a, b) => {
        const aProviderIndex = this.config.services.findIndex(
          (service) => service.id === a.provider?.id
        );
        const bProviderIndex = this.config.services.findIndex(
          (service) => service.id === b.provider?.id
        );

        if (aProviderIndex !== bProviderIndex) {
          return aProviderIndex - bProviderIndex;
        }

        const aAddonIndex = this.config.addons.findIndex(
          (addon) =>
            `${addon.id}-${JSON.stringify(addon.options)}` === a.addon.id
        );
        const bAddonIndex = this.config.addons.findIndex(
          (addon) =>
            `${addon.id}-${JSON.stringify(addon.options)}` === b.addon.id
        );

        if (aAddonIndex !== bAddonIndex) {
          return aAddonIndex - bAddonIndex;
        }

        // now look at the type of stream. prefer usenet over torrents
        if (a.torrent?.seeders && !b.torrent?.seeders) return 1;
        if (!a.torrent?.seeders && b.torrent?.seeders) return -1;
        return 0;
      })[0];
      // Select one non-provider stream (highest addon priority)
      const selectedNoProviderStream = noProviderStreams.sort((a, b) => {
        const aIndex = this.config.addons.findIndex(
          (addon) =>
            `${addon.id}-${JSON.stringify(addon.options)}` === a.addon.id
        );
        const bIndex = this.config.addons.findIndex(
          (addon) =>
            `${addon.id}-${JSON.stringify(addon.options)}` === b.addon.id
        );

        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        // now look at the type of stream. prefer usenet over torrents
        if (a.torrent?.seeders && !b.torrent?.seeders) return 1;
        if (!a.torrent?.seeders && b.torrent?.seeders) return -1;
        return 0;
      })[0];

      // Combine selected streams for this group
      if (selectedNoProviderStream) {
        //logger.info(`Selected no provider stream: Addon ID: ${selectedNoProviderStream.addon.id}`);
        uniqueStreams.push(selectedNoProviderStream);
      }
      if (selectedCachedStream) {
        //logger.info(`Selected cached stream for provider ${selectedCachedStream.provider!.id} from Addon ID: ${selectedCachedStream.addon.id}`);
        uniqueStreams.push(selectedCachedStream);
      }
      uniqueStreams.push(...selectedUncachedStreams);
    });

    return uniqueStreams;
  }
}
