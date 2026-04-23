package plugin

import (
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func TestBaselineCache_SetAndGet(t *testing.T) {
	cache := NewBaselineCache(1*time.Minute, log.DefaultLogger)

	val := 42.5
	results := map[string]*float64{
		"node:a:cpu": &val,
		"node:b:cpu": nil,
	}

	cache.Set("key1", results)
	got, ok := cache.Get("key1")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got["node:a:cpu"] == nil || *got["node:a:cpu"] != 42.5 {
		t.Fatalf("expected 42.5, got %v", got["node:a:cpu"])
	}
	if got["node:b:cpu"] != nil {
		t.Fatalf("expected nil, got %v", *got["node:b:cpu"])
	}
}

func TestBaselineCache_Miss(t *testing.T) {
	cache := NewBaselineCache(1*time.Minute, log.DefaultLogger)

	_, ok := cache.Get("nonexistent")
	if ok {
		t.Fatal("expected cache miss")
	}
}

func TestBaselineCache_Expiry(t *testing.T) {
	cache := NewBaselineCache(1*time.Millisecond, log.DefaultLogger)

	val := 1.0
	cache.Set("key1", map[string]*float64{"x": &val})

	time.Sleep(5 * time.Millisecond)

	_, ok := cache.Get("key1")
	if ok {
		t.Fatal("expected cache miss after TTL expiry")
	}
}

func TestBaselineCache_EvictsOldestWhenFull(t *testing.T) {
	cache := NewBaselineCache(1*time.Minute, log.DefaultLogger)

	val := 1.0
	for i := 0; i < maxCacheEntries; i++ {
		cache.Set("key"+string(rune(i)), map[string]*float64{"x": &val})
	}

	// Cache is at capacity. Setting a new key should evict the oldest entry.
	cache.Set("overflow", map[string]*float64{"x": &val})

	cache.mu.RLock()
	defer cache.mu.RUnlock()

	// New entry must be present.
	if _, exists := cache.entries["overflow"]; !exists {
		t.Fatal("expected overflow entry to be accepted after evicting oldest")
	}
	// Cache must not exceed capacity.
	if len(cache.entries) > maxCacheEntries {
		t.Fatalf("expected at most %d entries, got %d", maxCacheEntries, len(cache.entries))
	}
}

func TestBaselineCache_EvictsEntryClosestToExpiry(t *testing.T) {
	cache := NewBaselineCache(10*time.Minute, log.DefaultLogger)

	val := 1.0

	// Insert "old" first — it will have the earliest expiresAt.
	cache.Set("old", map[string]*float64{"x": &val})

	// Small delay so "new" gets a later expiresAt.
	time.Sleep(2 * time.Millisecond)

	// Fill remaining capacity.
	for i := 1; i < maxCacheEntries; i++ {
		cache.Set("key"+string(rune(i)), map[string]*float64{"x": &val})
	}

	// Trigger eviction — "old" should be the one evicted (earliest expiresAt).
	cache.Set("trigger", map[string]*float64{"x": &val})

	cache.mu.RLock()
	defer cache.mu.RUnlock()

	if _, exists := cache.entries["old"]; exists {
		t.Fatal("expected 'old' (earliest expiresAt) to be evicted")
	}
	if _, exists := cache.entries["trigger"]; !exists {
		t.Fatal("expected 'trigger' to be present after eviction")
	}
}

func TestBaselineCache_EvictsExpiredOnSet(t *testing.T) {
	cache := NewBaselineCache(1*time.Millisecond, log.DefaultLogger)

	val := 1.0
	cache.Set("old", map[string]*float64{"x": &val})

	time.Sleep(5 * time.Millisecond)

	// Setting a new key should evict the expired "old" entry.
	cache.Set("new", map[string]*float64{"y": &val})

	cache.mu.RLock()
	defer cache.mu.RUnlock()
	if _, exists := cache.entries["old"]; exists {
		t.Fatal("expected expired entry to be evicted")
	}
}
