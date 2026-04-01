package plugin

import (
	"sync"
	"time"
)

// BaselineCache is a simple in-memory TTL cache for week-ago (baseline)
// Prometheus query results. Baseline data is 7 days old and barely changes,
// so caching avoids re-fetching it on every 30-second poll.
type BaselineCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
	ttl     time.Duration
}

type cacheEntry struct {
	results   map[string]*float64
	expiresAt time.Time
}

// NewBaselineCache creates a cache with the given TTL.
func NewBaselineCache(ttl time.Duration) *BaselineCache {
	return &BaselineCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
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

	c.entries[key] = cacheEntry{
		results:   results,
		expiresAt: now.Add(c.ttl),
	}
}
