package plugin

import (
	"testing"
	"time"
)

func TestBaselineCache_SetAndGet(t *testing.T) {
	cache := NewBaselineCache(1 * time.Minute)

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
	cache := NewBaselineCache(1 * time.Minute)

	_, ok := cache.Get("nonexistent")
	if ok {
		t.Fatal("expected cache miss")
	}
}

func TestBaselineCache_Expiry(t *testing.T) {
	cache := NewBaselineCache(1 * time.Millisecond)

	val := 1.0
	cache.Set("key1", map[string]*float64{"x": &val})

	time.Sleep(5 * time.Millisecond)

	_, ok := cache.Get("key1")
	if ok {
		t.Fatal("expected cache miss after TTL expiry")
	}
}

func TestBaselineCache_EvictsExpiredOnSet(t *testing.T) {
	cache := NewBaselineCache(1 * time.Millisecond)

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
