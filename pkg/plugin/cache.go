package plugin

import (
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

const maxCacheEntries = 500

// BaselineCache is a simple in-memory TTL cache for week-ago (baseline)
// Prometheus query results. Baseline data is 7 days old and barely changes,
// so caching avoids re-fetching it on every 30-second poll.
type BaselineCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
	ttl     time.Duration
	logger  log.Logger
}

type cacheEntry struct {
	results   map[string]*float64
	expiresAt time.Time
}

// NewBaselineCache creates a cache with the given TTL.
func NewBaselineCache(ttl time.Duration, logger log.Logger) *BaselineCache {
	return &BaselineCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
		logger:  logger,
	}
}

// Get returns cached baseline results if the entry exists and has not expired.
func (c *BaselineCache) Get(key string) (map[string]*float64, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.entries[key]
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.results, true
}

// Set stores baseline results with the configured TTL.
func (c *BaselineCache) Set(key string, results map[string]*float64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Evict expired entries opportunistically.
	now := time.Now()
	for k, e := range c.entries {
		if now.After(e.expiresAt) {
			delete(c.entries, k)
		}
	}

	if len(c.entries) >= maxCacheEntries {
		// Evict the entry closest to expiry (oldest).
		var oldestKey string
		var oldestExpiry time.Time
		for k, e := range c.entries {
			if oldestKey == "" || e.expiresAt.Before(oldestExpiry) {
				oldestKey = k
				oldestExpiry = e.expiresAt
			}
		}
		delete(c.entries, oldestKey)
		c.logger.Warn("Baseline cache at capacity, evicted oldest entry", "evictedKey", oldestKey, "capacity", maxCacheEntries)
	}

	c.entries[key] = cacheEntry{
		results:   results,
		expiresAt: now.Add(c.ttl),
	}
}
