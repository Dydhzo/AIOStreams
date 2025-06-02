import { BaseWrapper } from './base';
import {
  Config,
  ParsedNameData,
  ParsedStream,
  ParseResult,
  Stream,
  StreamRequest,
} from '@aiostreams/types';
import { parseFilename } from '@aiostreams/parser';
import { createLogger, Settings } from '@aiostreams/utils';

const logger = createLogger('wrappers');

interface StreamFusionStream extends Stream {
  name: string;
  url: string;
  title?: string;
  hash?: string;
  is_cached?: boolean;
  size?: number;
  description: string;
  magnet?: string;
  nzb?: string;
  seeders?: number;
  peers?: number;
  quality?: string;
  resolution?: string;
  language?: string;
  type?: string;
  adult?: boolean;
  behaviorHints?: {
    filename?: string;
    videoSize?: number;
  };
}

export class StreamFusion extends BaseWrapper {
  private readonly apiKey: string;
  private readonly userConfigRef: Config;

  private readonly prioritiseDebrid?: string;

  constructor(
    apiKey: string,
    addonName: string = 'StreamFusion',
    addonId: string,
    userConfig: Config,
    indexerTimeout?: number,
    prioritiseDebrid?: string
  ) {
    super(
      addonName,
      Settings.STREAMFUSION_URL,
      addonId,
      userConfig,
      indexerTimeout || Settings.DEFAULT_STREAMFUSION_TIMEOUT
    );
    this.apiKey = apiKey;
    this.userConfigRef = userConfig;
    this.prioritiseDebrid = prioritiseDebrid;
  }

  /**
   * Vérifie si le torrenting est activé dans la configuration utilisateur
   */
  private isTorrentingEnabled(): boolean {
    // Vérifier si le type de stream p2p est activé
    const p2pEnabled = this.userConfigRef.streamTypes.some((streamType: any) => {
      return streamType['p2p'] === true;
    });
    
    // Le torrenting est activé si p2p est activé
    return p2pEnabled;
  }

  /**
   * Détermine l'option de tri en fonction de la configuration utilisateur
   */
  private determineSortOption(): string {
    // Parcourir les options de tri dans la configuration utilisateur
    for (const sortOption of this.userConfigRef.sortBy) {
      const sortKey = Object.keys(sortOption)[0];
      const isEnabled = sortOption[sortKey];
      
      if (isEnabled) {
        // Convertir les options de tri d'AIOStreams au format attendu par StreamFusion
        switch (sortKey) {
          case "quality":
            return "quality";
          case "size":
            // Vérifier la direction du tri
            if (sortOption.direction === "desc") {
              return "sizedesc";
            } else {
              return "sizeasc";
            }
          case "cached":
            return "cached";
          case "resolution":
            return "qualitythensize"; // Meilleure option pour prioriser la résolution
          default:
            // Par défaut, utiliser qualitythensize
            return "qualitythensize";
        }
      }
    }
    
    // Si aucune option de tri n'est activée, utiliser qualitythensize par défaut
    return "qualitythensize";
  }

  /**
   * Génère une liste de langues basée sur les préférences de l'utilisateur
   */
  private generateLanguagesList(): string[] {
    // Par défaut, inclure français et multi
    const languagesList: string[] = ["fr", "multi"];
    
    // Si l'utilisateur a des langues prioritaires définies, les utiliser
    if (this.userConfigRef.prioritisedLanguages && this.userConfigRef.prioritisedLanguages.length > 0) {
      // Convertir les codes de langue au format attendu par StreamFusion
      const priorityLanguages = this.userConfigRef.prioritisedLanguages.map((lang: string) => {
        // Convertir les codes de langue (par exemple, "French" -> "fr", "English" -> "en", etc.)
        switch (lang.toLowerCase()) {
          case "french":
            return "fr";
          case "english":
            return "en";
          case "german":
            return "de";
          case "spanish":
            return "es";
          case "italian":
            return "it";
          // Ajouter d'autres langues au besoin
          default:
            return lang.toLowerCase().substring(0, 2); // Prendre les 2 premiers caractères pour les autres langues
        }
      });
      
      // Ajouter les langues prioritaires à la liste
      priorityLanguages.forEach((lang: string) => {
        if (!languagesList.includes(lang)) {
          languagesList.push(lang);
        }
      });
    }
    
    logger.info(`Liste de langues générée pour StreamFusion: ${languagesList.join(', ')}`);
    return languagesList;
  }

  /**
   * Génère une liste d'exclusion basée sur les résolutions désactivées dans la configuration utilisateur
   */
  private generateExclusionList(): string[] {
    const exclusionList: string[] = ["cam", "unknown"];
    
    // Parcourir les résolutions dans la configuration utilisateur
    this.userConfigRef.resolutions.forEach((resolution: any) => {
      // Chaque résolution est un objet avec une seule clé (le nom de la résolution) et une valeur booléenne
      const resolutionName = Object.keys(resolution)[0];
      const isEnabled = resolution[resolutionName];
      
      // Si la résolution est désactivée, l'ajouter à la liste d'exclusion
      if (!isEnabled) {
        // Convertir le format de résolution (par exemple, "720p" reste "720p")
        exclusionList.push(resolutionName.toLowerCase());
      }
    });
    
    logger.info(`Liste d'exclusion générée pour StreamFusion: ${exclusionList.join(', ')}`);
    return exclusionList;
  }

  /**
   * Génère la configuration StreamFusion en fonction des paramètres de l'utilisateur
   */
  private generateStreamFusionConfig(): any {
    // Trouver le service StreamFusion dans la configuration de l'utilisateur
    const streamFusionService = this.userConfigRef.services.find(
      (service: any) => service.id === 'streamfusion'
    );

    // Trouver les services de débridage activés
    const enabledDebridServices = this.userConfigRef.services.filter(
      (service: any) =>
        service.enabled &&
        ['realdebrid', 'premiumize', 'alldebrid', 'torrentio', 'debridlink', 'easydebrid', 'offcloud', 'pikpak', 'torbox'].includes(service.id)
    );

    // Déterminer le service de débridage à utiliser, en tenant compte de la priorisation
    let debridService = null;
    if (this.prioritiseDebrid) {
      debridService = enabledDebridServices.find(
        (service: any) => service.id === this.prioritiseDebrid
      );
      if (!debridService) {
        throw new Error(`Debrid service not found for ${this.prioritiseDebrid}`);
      }
      if (!debridService.credentials || (debridService.id !== 'torrentio' && !debridService.credentials.apiKey)) {
        throw new Error(`Debrid service API key not found for ${this.prioritiseDebrid}`);
      }
    } else {
      debridService = enabledDebridServices.length > 0 ? enabledDebridServices[0] : null;
    }
    
    // Construire la configuration
    const config = {
      addonHost: Settings.STREAMFUSION_URL.replace(/\/$/, ''),
      apiKey: this.apiKey,
      service: debridService ? [debridService.id === 'alldebrid' ? "AllDebrid" : debridService.name] : [],
      RDToken: "",
      ADToken: "",
      TBToken: "", // Token Torbox nécessaire
      PMToken: "",
      DLToken: "", // Token DebridLink
      EDToken: "", // Token EasyDebrid
      OCToken: "", // Token Offcloud
      PKToken: "", // Token PikPak
      TBUsenet: false,
      TBSearch: true, // Activer la recherche Torbox
      // Utiliser la taille maximale définie par l'utilisateur ou 100 par défaut
      maxSize: this.userConfigRef.maxMovieSize ? Math.floor(this.userConfigRef.maxMovieSize / 1073741824) : 100, // Convertir octets en GB
      // Utiliser les mots-clés d'exclusion définis par l'utilisateur
      exclusionKeywords: this.userConfigRef.excludeFilters || [],
      languages: this.generateLanguagesList(),
      // Déterminer l'option de tri en fonction de la configuration utilisateur
      sort: this.determineSortOption(),
      // Utiliser les paramètres de résultats définis par l'utilisateur ou les valeurs par défaut
      resultsPerQuality: this.userConfigRef.maxResultsPerResolution || 10,
      maxResults: 30,
      minCachedResults: this.userConfigRef.onlyShowCachedStreams ? 30 : 10,
      // Générer la liste d'exclusion en fonction des résolutions désactivées dans la configuration utilisateur
      exclusion: this.generateExclusionList(),
      cacheUrl: "https://stremio-jackett-cacher.elfhosted.com/",
      cache: true,
      // Paramètres des API - par défaut activés sauf indication contraire
      zilean: true,
      yggflix: true,
      sharewood: true,
      // Paramètres des catalogues - par défaut activés
      yggtorrentCtg: true,
      yggflixCtg: true,
      // Activer le torrenting uniquement si explicitement demandé dans la configuration
      torrenting: this.isTorrentingEnabled(),
      // Toujours activer le débridage puisque c'est le but principal
      debrid: true,
      // Utiliser TMDB comme fournisseur de métadonnées par défaut
      metadataProvider: "tmdb",
      debridDownloader: debridService ? (debridService.id === 'alldebrid' ? "AllDebrid" : debridService.name) : ""
    };

    // Ajouter les tokens appropriés en fonction du service de débridage
    if (debridService && debridService.credentials) {
      if (debridService.id === 'realdebrid') {
        config.RDToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'premiumize') {
        config.PMToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'alldebrid') {
        config.ADToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'debridlink') {
        config.DLToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'easydebrid') {
        config.EDToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'offcloud') {
        config.OCToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'pikpak') {
        config.PKToken = debridService.credentials.apiKey || "";
      } else if (debridService.id === 'torbox') {
        config.TBToken = debridService.credentials.apiKey || "";
      }
    }

    return config;
  }

  protected async getStreams(streamRequest: StreamRequest): Promise<Stream[]> {
    const { type, id } = streamRequest;
    
    // Construire l'URL avec la configuration encodée
    const baseUrl = Settings.STREAMFUSION_URL.endsWith('/')
      ? Settings.STREAMFUSION_URL.slice(0, -1)
      : Settings.STREAMFUSION_URL;
    
    // Générer la configuration dynamiquement en fonction des paramètres de l'utilisateur
    const config = this.generateStreamFusionConfig();
    // Use btoa for base64 encoding in browser environments, or fallback to Buffer if available
    let encodedConfigUrl = '';
    try {
      if (typeof btoa !== 'undefined') {
        encodedConfigUrl = btoa(JSON.stringify(config));
      } else if (typeof Buffer !== 'undefined') {
        encodedConfigUrl = Buffer.from(JSON.stringify(config)).toString('base64');
      } else {
        throw new Error('No base64 encoding method available');
      }
    } catch (e) {
      logger.error(`Error encoding config for StreamFusion: ${e}`);
      throw new Error('Failed to encode configuration for StreamFusion');
    }
    
    // Construire l'URL de base
    const baseApiUrl = `${baseUrl}/${encodedConfigUrl}/stream/${type}/${id}.json`;
    
    // Ajouter l'API key en tant que paramètre de requête
    const url = this.apiKey ? `${baseApiUrl}?api_key=${this.apiKey}` : baseApiUrl;
    
    logger.info(`Making request to StreamFusion: ${url.replace(this.apiKey || '', '***')}`);
    
    try {
      const response = await this.makeRequest(url);
      
      if (!response.ok) {
        throw new Error(`${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.streams || [];
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error during fetch for ${this.addonName}: ${errorMessage}`);
      throw error;
    }
  }
  
  protected parseStream(stream: StreamFusionStream): ParseResult {
    let type = stream.type || 'unknown';
    let personal = false;
    
    const filename = stream.behaviorHints?.filename || stream.name;
    const parsedFilename: ParsedNameData = parseFilename(
      filename || stream.description
    );

    // Extract language information if available
    const language = stream.language;
    if (language && language !== 'Unknown' && !parsedFilename.languages.includes(language)) {
      parsedFilename.languages.push(language);
    }

    // Get size in bytes
    const validateBehaviorHintSize = (size: any): number | undefined => {
      if (size === undefined) return undefined;
      if (typeof size === 'number') return size;
      if (typeof size === 'string') {
        const parsed = parseInt(size, 10);
        return isNaN(parsed) ? undefined : parsed;
      }
      return undefined;
    };
    
    let sizeInBytes =
      stream.size ||
      validateBehaviorHintSize(stream.behaviorHints?.videoSize);
    
    // If size is not available from structured fields, try to extract it from the description
    if (!sizeInBytes && stream.description) {
      // Look for a pattern like "💾 X.XXGB" in the description
      const sizeMatch = stream.description.match(/💾\s*([\d.]+)\s*GB/i);
      if (sizeMatch && sizeMatch[1]) {
        const sizeInGB = parseFloat(sizeMatch[1]);
        if (!isNaN(sizeInGB)) {
          // Convert GB to bytes (1 GB = 1024 * 1024 * 1024 bytes)
          sizeInBytes = Math.floor(sizeInGB * 1024 * 1024 * 1024);
        }
      }
    }

    // Déterminer si le flux est en cache en utilisant à la fois is_cached et les symboles dans le nom
    let isCached = stream.is_cached !== undefined ? stream.is_cached : false;
    
    // Vérifier également les symboles de cache dans le nom ou la description
    const cachedSymbols = ['+', '⚡', '🚀', 'cached'];
    const uncachedSymbols = ['⏳', 'download', 'UNCACHED'];
    
    const nameOrDesc = stream.name || stream.description || '';
    
    // Si des symboles de non-cache sont présents, le flux n'est pas en cache
    if (uncachedSymbols.some(symbol => nameOrDesc.includes(symbol))) {
      isCached = false;
    }
    // Si des symboles de cache sont présents, le flux est en cache
    else if (cachedSymbols.some(symbol => nameOrDesc.includes(symbol))) {
      isCached = true;
    }
    
    // Set provider information - toujours définir un provider pour que le type soit 'debrid'
    const provider = {
      id: 'streamfusion',
      cached: isCached,
    };

    // Extract seeders information if available
    const seeders = stream.seeders;
    
    // Get infoHash if available
    let infoHash = stream.hash || this.extractInfoHash(stream.url);

    // Retour à l'implémentation standard sans modification spéciale pour 'debrid'
    const parsedStream = this.createParsedResult({
      parsedInfo: parsedFilename,
      stream: stream,
      filename: filename,
      size: sizeInBytes,
      provider: provider,
      seeders: seeders,
      usenetAge: undefined,
      indexer: undefined,
      duration: undefined,
      personal: personal,
      infoHash: infoHash
    });
    
    return parsedStream;
  }
}

export async function getStreamFusionStreams(
  config: Config,
  streamFusionOptions: {
    indexerTimeout?: string;
    overrideName?: string;
    apiKey?: string;
    prioritiseDebrid?: string;
  },
  streamRequest: StreamRequest,
  addonId: string
): Promise<{ addonStreams: ParsedStream[]; addonErrors: string[] }> {
  const streamFusionService = config.services.find(
    (service: any) => service.id === 'streamfusion'
  );
  if (!streamFusionService) {
    throw new Error('StreamFusion service not found');
  }

  // Chercher d'abord l'API key dans les options de l'addon
  let streamFusionApiKey = streamFusionOptions.apiKey;
  
  // Si l'API key n'est pas dans les options, chercher dans les credentials du service
  if (!streamFusionApiKey && streamFusionService.credentials) {
    streamFusionApiKey = streamFusionService.credentials.apiKey;
  }
  
  if (!streamFusionApiKey) {
    throw new Error('StreamFusion API key not found');
  }

  const indexerTimeout = streamFusionOptions.indexerTimeout
    ? parseInt(streamFusionOptions.indexerTimeout)
    : undefined;

  // Liste des services de débridage supportés par StreamFusion
  const supportedServices = [
    'realdebrid', 'premiumize', 'alldebrid', 'torrentio',
    'debridlink', 'easydebrid', 'offcloud', 'pikpak', 'torbox'
  ];
  
  // Trouver tous les services utilisables et activés
  const usableServices = config.services.filter(
    (service) => supportedServices.includes(service.id) && service.enabled
  );

  // Si aucun service utilisable n'est trouvé, lancer une erreur
  if (usableServices.length < 1) {
    throw new Error('No supported debrid service(s) enabled for StreamFusion');
  }

  // Vérifier si prioritiseDebrid est défini et valide
  if (streamFusionOptions.prioritiseDebrid && !supportedServices.includes(streamFusionOptions.prioritiseDebrid)) {
    throw new Error(`Invalid debrid service: ${streamFusionOptions.prioritiseDebrid}`);
  }

  // Si prioritiseDebrid est défini, utiliser uniquement ce service
  if (streamFusionOptions.prioritiseDebrid) {
    const debridService = usableServices.find(
      (service) => service.id === streamFusionOptions.prioritiseDebrid
    );
    if (!debridService) {
      throw new Error(`Debrid service not found for ${streamFusionOptions.prioritiseDebrid}`);
    }
    if (!debridService.credentials || (debridService.id !== 'torrentio' && !debridService.credentials.apiKey)) {
      throw new Error(`Debrid service API key not found for ${streamFusionOptions.prioritiseDebrid}`);
    }

    const streamFusion = new StreamFusion(
      streamFusionApiKey,
      streamFusionOptions.overrideName,
      addonId,
      config,
      indexerTimeout,
      streamFusionOptions.prioritiseDebrid
    );
    return await streamFusion.getParsedStreams(streamRequest);
  }
  
  // Liste des services de débridage supportés pour validation
  const SUPPORTED_DEBRID_SERVICES = [
    'realdebrid', 'premiumize', 'alldebrid', 'torrentio',
    'debridlink', 'easydebrid', 'offcloud', 'pikpak', 'torbox'
  ];
  
  // Ajout de validation pour prioritiseDebrid
  if (streamFusionOptions.prioritiseDebrid && !SUPPORTED_DEBRID_SERVICES.includes(streamFusionOptions.prioritiseDebrid)) {
    throw new Error(`Invalid debrid service: ${streamFusionOptions.prioritiseDebrid}`);
  }

  // Sinon, créer une instance pour chaque service activé
  const addonStreams: ParsedStream[] = [];
  const addonErrors: string[] = [];
  const servicesToUse = usableServices.filter((service) => service.enabled);

  const streamPromises = servicesToUse.map(async (service) => {
    logger.info(`Getting StreamFusion streams for ${service.id}`, { func: 'streamfusion' });
    const streamFusion = new StreamFusion(
      streamFusionApiKey,
      streamFusionOptions.overrideName,
      addonId,
      config,
      indexerTimeout,
      service.id // Passer l'ID du service comme prioritiseDebrid pour cette instance
    );
    return streamFusion.getParsedStreams(streamRequest);
  });

  const results = await Promise.allSettled(streamPromises);
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      addonStreams.push(...result.value.addonStreams);
      addonErrors.push(...result.value.addonErrors);
    } else {
      addonErrors.push(result.reason.message);
    }
  });

  return { addonStreams, addonErrors };
}