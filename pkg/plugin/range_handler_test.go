package plugin

import (
	"strings"
	"testing"
)

func TestValidateRangeRequest_RejectsInvertedRange(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   2000,
		End:     1000,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "end must be greater than start") {
		t.Fatalf("expected inverted range error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsEqualStartEnd(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   1000,
		End:     1000,
		Step:    60,
	}
	if err := validateRangeRequest(req); err == nil {
		t.Fatal("expected error when start == end")
	}
}

func TestValidateRangeRequest_RejectsExcessiveWindow(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   0,
		End:     maxRangeWindowSeconds + 1,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "time range too large") {
		t.Fatalf("expected window-too-large error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsStepBelowMinimum(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   0,
		End:     3600,
		Step:    minRangeStepSeconds - 1,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "step too small") {
		t.Fatalf("expected step-too-small error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsTooManyQueries(t *testing.T) {
	queries := make(map[string]string, maxRangeQueriesPerCall+1)
	for i := 0; i <= maxRangeQueriesPerCall; i++ {
		queries[string(rune('a'+i))+"-key"] = "up"
	}
	req := MetricRangeRequest{
		Queries: queries,
		Start:   0,
		End:     3600,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "too many queries") {
		t.Fatalf("expected too-many-queries error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsTooLongPromQL(t *testing.T) {
	long := strings.Repeat("x", maxPromQLLen+1)
	req := MetricRangeRequest{
		Queries: map[string]string{"k": long},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	err := validateRangeRequest(req)
	if err == nil || !strings.Contains(err.Error(), "PromQL expression too long") {
		t.Fatalf("expected PromQL-too-long error, got: %v", err)
	}
}

func TestValidateRangeRequest_AcceptsValidRequest(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k1": "up", "k2": "avg(cpu)"},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	if err := validateRangeRequest(req); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestValidateRangeRequest_RejectsInvalidFieldsEvenWithEmptyQueries(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{},
		Start:   99999,
		End:     0,
		Step:    -1,
	}
	if err := validateRangeRequest(req); err == nil {
		t.Fatal("expected validation error for empty queries with invalid fields")
	}
}

func TestValidateRangeRequest_AcceptsEmptyQueriesWithValidFields(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{},
		Start:   0,
		End:     3600,
		Step:    60,
	}
	if err := validateRangeRequest(req); err != nil {
		t.Fatalf("expected no error for valid empty-queries request, got: %v", err)
	}
}

func TestValidateRangeRequest_AcceptsMaxBoundaries(t *testing.T) {
	req := MetricRangeRequest{
		Queries: map[string]string{"k": "up"},
		Start:   0,
		End:     maxRangeWindowSeconds,
		Step:    minRangeStepSeconds,
	}
	if err := validateRangeRequest(req); err != nil {
		t.Fatalf("expected no error at boundaries, got: %v", err)
	}
}
