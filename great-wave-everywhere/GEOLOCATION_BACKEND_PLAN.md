# 🗺️ Backend Geolocation Implementation Plan

## Current State

- **Frontend**: Makes direct API calls with CORS proxy workarounds (unreliable)
- **Backend**: `great-wave-api-1muq.onrender.com` serves image search results
- **Issue**: CORS proxies failing, no real IP resolution for domains

## Proposed Backend Architecture

### 1. New API Endpoint: `/api/geolocation`

```javascript
// POST /api/geolocation
// Request Body:
{
  "domains": ["i.imgur.com", "upload.wikimedia.org", "i.ytimg.com"]
}

// Response:
{
  "locations": [
    {
      "domain": "i.imgur.com",
      "ip": "151.101.193.193",
      "country": "United States",
      "city": "San Francisco",
      "lat": 37.7749,
      "lng": -122.4194,
      "isp": "Fastly"
    },
    {
      "domain": "upload.wikimedia.org",
      "ip": "208.80.154.240",
      "country": "Netherlands",
      "city": "Amsterdam",
      "lat": 52.3676,
      "lng": 4.9041,
      "isp": "Wikimedia Foundation"
    }
  ],
  "cached": 2,
  "fresh": 1
}
```

### 2. Backend Implementation Steps

#### Phase 1: Basic DNS + Geolocation

```javascript
// Dependencies to add:
// npm install dns ipinfo node-cache

const dns = require("dns").promises;
const IPinfoWrapper = require("ipinfo");
const NodeCache = require("node-cache");

// Cache for 24 hours (domains don't change IPs frequently)
const geoCache = new NodeCache({ stdTTL: 86400 });

async function geolocateDomains(domains) {
  const results = [];

  for (const domain of domains) {
    try {
      // Check cache first
      const cached = geoCache.get(domain);
      if (cached) {
        results.push({ ...cached, fromCache: true });
        continue;
      }

      // DNS lookup to get IP
      const addresses = await dns.resolve4(domain);
      const ip = addresses[0]; // Take first IP

      // Get geolocation data
      const ipinfo = new IPinfoWrapper(process.env.IPINFO_API_KEY);
      const response = await ipinfo.lookupIp(ip);

      const locationData = {
        domain,
        ip,
        country: response.country,
        city: response.city,
        lat: parseFloat(response.loc?.split(",")[0]) || 0,
        lng: parseFloat(response.loc?.split(",")[1]) || 0,
        isp: response.org,
        fromCache: false,
      };

      // Cache the result
      geoCache.set(domain, locationData);
      results.push(locationData);
    } catch (error) {
      // Fallback to static mapping
      results.push(getStaticLocation(domain));
    }
  }

  return results;
}
```

#### Phase 2: Enhanced with Fallbacks

```javascript
// Static fallback for known CDNs
const STATIC_LOCATIONS = {
  "i.imgur.com": {
    country: "US",
    city: "San Francisco",
    lat: 37.7749,
    lng: -122.4194,
  },
  "upload.wikimedia.org": {
    country: "NL",
    city: "Amsterdam",
    lat: 52.3676,
    lng: 4.9041,
  },
  "i.ytimg.com": {
    country: "US",
    city: "Mountain View",
    lat: 37.4419,
    lng: -122.143,
  },
  // ... more mappings
};

// TLD-based country guessing
function guessLocationFromTLD(domain) {
  if (domain.endsWith(".jp"))
    return { country: "Japan", city: "Tokyo", lat: 35.6762, lng: 139.6503 };
  if (domain.endsWith(".uk"))
    return { country: "UK", city: "London", lat: 51.5074, lng: -0.1278 };
  if (domain.endsWith(".de"))
    return { country: "Germany", city: "Berlin", lat: 52.52, lng: 13.405 };
  // Default to US
  return {
    country: "United States",
    city: "San Francisco",
    lat: 37.7749,
    lng: -122.4194,
  };
}
```

### 3. API Integration Strategy

#### Enhanced Image Endpoint

```javascript
// Modify existing /api/images endpoint to include geolocation
// GET /api/images?q=search&includeLocations=true

{
  "images": [
    {
      "link": "https://i.imgur.com/abc123.jpg",
      "title": "Great Wave artwork",
      "location": {
        "country": "United States",
        "city": "San Francisco",
        "lat": 37.7749,
        "lng": -122.4194
      }
    }
  ],
  "searchQuery": "great wave",
  "locationStats": {
    "totalLocations": 6,
    "countries": ["United States", "Netherlands", "Japan"],
    "fromCache": 4,
    "freshLookups": 2
  }
}
```

### 4. Frontend Integration

#### Modified fetchImages Function

```javascript
async function fetchImages() {
  if (!userQuery) return;

  loading = true;
  try {
    const response = await axios.get(
      `https://great-wave-api-1muq.onrender.com/api/images?q=${userQuery}&includeLocations=true`
    );

    images = response.data.images;
    serverLocations = response.data.images.map((img) => img.location);

    // Update word cloud
    await updateWord(userQuery);
    nodes = await fetchWords();
    trending = await fetchTrendingWords(5);
    buildLinks();
    restartSimulation();

    userQuery = "";
  } catch (error) {
    console.error("Error fetching images", error);
  } finally {
    loading = false;
  }
}
```

### 5. Implementation Priority

#### Immediate (Week 1)

- [ ] Add `/api/geolocation` endpoint to existing backend
- [ ] Implement DNS lookup + basic IP geolocation
- [ ] Add caching layer (Node.js in-memory cache)
- [ ] Test with a few sample domains

#### Short-term (Week 2-3)

- [ ] Integrate geolocation into existing `/api/images` endpoint
- [ ] Add static fallback mappings for major CDNs
- [ ] Implement TLD-based country guessing
- [ ] Update frontend to consume location data

#### Medium-term (Month 1)

- [ ] Add Redis caching for production scalability
- [ ] Implement rate limiting for IP geolocation APIs
- [ ] Add batch processing for multiple domains
- [ ] Monitor API usage and costs

#### Advanced (Month 2+)

- [ ] Multiple geolocation provider fallbacks (ipinfo.io → ipapi.com → maxmind)
- [ ] Geographic clustering for map visualization
- [ ] Analytics on global content distribution
- [ ] Historical geolocation tracking

### 6. Cost & Performance Considerations

#### API Costs

- **ipinfo.io**: 50k requests/month free, then $149/month
- **ipapi.com**: 1k requests/month free, then $10/month
- **MaxMind**: One-time license, self-hosted

#### Caching Strategy

- **24-hour cache** for domain→IP mappings (IPs rarely change)
- **7-day cache** for IP→location (ISP assignments stable)
- **Redis backend** for production (shared across instances)

#### Rate Limiting

- **1 request/second** to geolocation APIs
- **Batch processing** for multiple domains
- **Queue system** for high-volume searches

### 7. Testing Strategy

#### Unit Tests

- DNS resolution with mock responses
- Geolocation API calls with test data
- Cache hit/miss scenarios
- Fallback logic validation

#### Integration Tests

- End-to-end image search with geolocation
- Performance under load (100+ domains)
- Error handling (API failures, timeouts)

#### Acceptance Criteria

- ✅ All image results have valid geographic coordinates
- ✅ 95% cache hit rate for repeat searches
- ✅ <2 second response time for 6-image search results
- ✅ Graceful degradation when geolocation APIs fail

## Benefits of Backend Implementation

1. **Reliability**: No CORS issues, proper error handling
2. **Performance**: Caching, batch processing, efficient DNS lookups
3. **Cost Control**: Rate limiting, fallbacks, shared cache
4. **Accuracy**: Real DNS resolution, multiple provider fallbacks
5. **Scalability**: Production-ready caching, monitoring
6. **Security**: API keys on server, no client-side exposure

This approach transforms geolocation from a brittle frontend hack into a robust, scalable backend service that provides reliable geographic data for the world map visualization.
