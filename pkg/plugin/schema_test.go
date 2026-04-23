package plugin

import (
	"errors"
	"fmt"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// ─── Helper ───────────────────────────────────────────────────────────────────

func mustNewValidator(t *testing.T) *SchemaValidator {
	t.Helper()
	v, err := NewSchemaValidator()
	if err != nil {
		t.Fatalf("NewSchemaValidator() failed: %v", err)
	}
	return v
}

// ─── NewSchemaValidator ───────────────────────────────────────────────────────

func TestNewSchemaValidator_Succeeds(t *testing.T) {
	v, err := NewSchemaValidator()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if v == nil {
		t.Fatal("expected non-nil validator")
	}
}

// ─── Node template: valid ─────────────────────────────────────────────────────

func TestValidateNodeTemplate_EKSService(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "eks-service",
		"id": "svc-a",
		"label": "Service A",
		"dataSource": "prometheus-main",
		"namespace": "default",
		"metrics": {}
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("expected valid EKS node template, got error: %v", err)
	}
}

func TestValidateNodeTemplate_EKSServiceWithFullMetrics(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "eks-service",
		"id": "svc-full",
		"label": "Full Service",
		"dataSource": "prom",
		"namespace": "prod",
		"metrics": {
			"cpu": {"query": "avg(cpu)", "unit": "%", "direction": "lower-is-better"},
			"memory": {"query": "avg(memory)", "unit": "bytes", "direction": "lower-is-better"}
		},
		"deploymentNames": ["deploy-a", "deploy-b"]
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("expected valid, got error: %v", err)
	}
}

func TestValidateNodeTemplate_EC2Service(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "ec2-service",
		"id": "ec2-a",
		"label": "EC2 Host",
		"dataSource": "prom",
		"instanceId": "i-12345",
		"instanceType": "t3.medium",
		"availabilityZone": "us-east-1a",
		"metrics": {}
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("expected valid EC2 node template, got error: %v", err)
	}
}

func TestValidateNodeTemplate_Database(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "database",
		"id": "db-main",
		"label": "Main DB",
		"dataSource": "prom",
		"engine": "postgres",
		"isReadReplica": false,
		"metrics": {}
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("expected valid database node template, got error: %v", err)
	}
}

func TestValidateNodeTemplate_External(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "external",
		"id": "ext-stripe",
		"label": "Stripe API",
		"dataSource": "prom",
		"provider": "Stripe",
		"metrics": {}
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("expected valid external node template, got error: %v", err)
	}
}

func TestValidateNodeTemplate_NullMetricSlots(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "eks-service",
		"id": "svc-nulls",
		"label": "Null Metrics",
		"dataSource": "prom",
		"namespace": "staging",
		"metrics": {
			"cpu": null,
			"memory": null
		}
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("null metric slots should be valid, got error: %v", err)
	}
}

func TestValidateNodeTemplate_WithCustomMetrics(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "external",
		"id": "ext-cm",
		"label": "With Custom",
		"dataSource": "prom",
		"provider": "AWS",
		"metrics": {},
		"customMetrics": [
			{
				"key": "api-latency",
				"label": "API Latency",
				"query": "histogram_quantile(0.95, rate(http_duration_bucket[5m]))",
				"unit": "ms",
				"direction": "lower-is-better"
			}
		]
	}`)
	if err := v.ValidateNodeTemplate(raw); err != nil {
		t.Errorf("expected valid, got error: %v", err)
	}
}

// ─── Node template: invalid ───────────────────────────────────────────────────

func TestValidateNodeTemplate_MissingRequiredFields(t *testing.T) {
	v := mustNewValidator(t)
	// Missing id, label, dataSource, namespace, metrics
	raw := []byte(`{"kind": "eks-service"}`)
	if err := v.ValidateNodeTemplate(raw); err == nil {
		t.Error("expected error for missing required fields, got nil")
	}
}

func TestValidateNodeTemplate_InvalidKind(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "lambda",
		"id": "x",
		"label": "X",
		"dataSource": "prom",
		"metrics": {}
	}`)
	if err := v.ValidateNodeTemplate(raw); err == nil {
		t.Error("expected error for invalid kind 'lambda', got nil")
	}
}

func TestValidateNodeTemplate_WrongMetricDirection(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "eks-service",
		"id": "svc",
		"label": "Svc",
		"dataSource": "prom",
		"namespace": "ns",
		"metrics": {
			"cpu": {"query": "q", "unit": "%", "direction": "invalid-value"}
		}
	}`)
	if err := v.ValidateNodeTemplate(raw); err == nil {
		t.Error("expected error for invalid metric direction enum value, got nil")
	}
}

func TestValidateNodeTemplate_ExtraProperty(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "eks-service",
		"id": "svc",
		"label": "Svc",
		"dataSource": "prom",
		"namespace": "ns",
		"metrics": {},
		"unexpected_field": true
	}`)
	if err := v.ValidateNodeTemplate(raw); err == nil {
		t.Error("expected error for additionalProperties, got nil")
	}
}

func TestValidateNodeTemplate_EmptyObject(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateNodeTemplate([]byte(`{}`)); err == nil {
		t.Error("expected error for empty object, got nil")
	}
}

func TestValidateNodeTemplate_StringWhereObjectExpected(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateNodeTemplate([]byte(`"just a string"`)); err == nil {
		t.Error("expected error when string given instead of object, got nil")
	}
}

func TestValidateNodeTemplate_NullInput(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateNodeTemplate([]byte(`null`)); err == nil {
		t.Error("expected error for null, got nil")
	}
}

// ─── Edge template: valid ─────────────────────────────────────────────────────

func TestValidateEdgeTemplate_HttpJson(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "http-json",
		"id": "edge-a",
		"source": "svc-a",
		"target": "svc-b",
		"dataSource": "prom",
		"metrics": {
			"rps": {"query": "sum(rate(http_requests_total[5m]))", "unit": "req/s", "direction": "higher-is-better"},
			"latencyP95": {"query": "histogram_quantile(0.95, rate(http_duration_bucket[5m]))", "unit": "ms", "direction": "lower-is-better"},
			"errorRate": {"query": "sum(rate(http_errors_total[5m]))", "unit": "%", "direction": "lower-is-better"}
		}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid http-json edge, got error: %v", err)
	}
}

func TestValidateEdgeTemplate_HttpJsonMinimalMetrics(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "http-json",
		"id": "e1",
		"source": "a",
		"target": "b",
		"dataSource": "prom",
		"metrics": {}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid http-json edge with empty metrics, got error: %v", err)
	}
}

func TestValidateEdgeTemplate_Grpc(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "grpc",
		"id": "grpc-edge",
		"source": "svc-a",
		"target": "svc-b",
		"dataSource": "prom",
		"grpcService": "my.Service",
		"grpcMethod": "GetItem",
		"metrics": {}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid grpc edge, got error: %v", err)
	}
}

func TestValidateEdgeTemplate_TcpDb(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "tcp-db",
		"id": "tcp-edge",
		"source": "svc-a",
		"target": "db-main",
		"dataSource": "prom",
		"metrics": {
			"activeConnections": {"query": "pgbouncer_active", "unit": "conn", "direction": "lower-is-better"}
		}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid tcp-db edge, got error: %v", err)
	}
}

func TestValidateEdgeTemplate_Amqp(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "amqp",
		"id": "amqp-edge",
		"source": "svc-a",
		"target": "svc-b",
		"dataSource": "prom",
		"exchange": "events",
		"publish": {
			"metrics": {}
		}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid amqp edge, got error: %v", err)
	}
}

func TestValidateEdgeTemplate_Kafka(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "kafka",
		"id": "kafka-edge",
		"source": "svc-a",
		"target": "svc-b",
		"dataSource": "prom",
		"topic": "orders",
		"publish": {
			"metrics": {}
		}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid kafka edge, got error: %v", err)
	}
}

func TestValidateEdgeTemplate_HttpXml(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "http-xml",
		"id": "xml-edge",
		"source": "svc-a",
		"target": "ext-soap",
		"dataSource": "prom",
		"metrics": {}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err != nil {
		t.Errorf("expected valid http-xml edge, got error: %v", err)
	}
}

// ─── Edge template: invalid ───────────────────────────────────────────────────

func TestValidateEdgeTemplate_MissingSource(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "http-json",
		"id": "e1",
		"target": "b",
		"dataSource": "prom",
		"metrics": {}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err == nil {
		t.Error("expected error for missing 'source', got nil")
	}
}

func TestValidateEdgeTemplate_InvalidKind(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "websocket",
		"id": "e1",
		"source": "a",
		"target": "b",
		"dataSource": "prom",
		"metrics": {}
	}`)
	if err := v.ValidateEdgeTemplate(raw); err == nil {
		t.Error("expected error for invalid kind 'websocket', got nil")
	}
}

func TestValidateEdgeTemplate_GrpcMissingServiceAndMethod(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "grpc",
		"id": "grpc-edge",
		"source": "a",
		"target": "b",
		"dataSource": "prom",
		"metrics": {}
	}`)
	// grpc requires grpcService and grpcMethod
	if err := v.ValidateEdgeTemplate(raw); err == nil {
		t.Error("expected error for grpc missing grpcService/grpcMethod, got nil")
	}
}

func TestValidateEdgeTemplate_EmptyObject(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateEdgeTemplate([]byte(`{}`)); err == nil {
		t.Error("expected error for empty object, got nil")
	}
}

// ─── Flow: valid ──────────────────────────────────────────────────────────────

func TestValidateFlow_MinimalValid(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-1",
		"name": "Main Flow",
		"definition": {
			"nodes": [],
			"edges": []
		}
	}`)
	if err := v.ValidateFlow(raw); err != nil {
		t.Errorf("expected valid minimal flow, got error: %v", err)
	}
}

func TestValidateFlow_WithNodeRefs(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-2",
		"name": "With Refs",
		"definition": {
			"nodes": [
				{"nodeId": "svc-a"},
				{"nodeId": "svc-b", "label": "Override Label"}
			],
			"edges": [
				{"edgeId": "edge-a", "kind": "http-json"}
			]
		}
	}`)
	if err := v.ValidateFlow(raw); err != nil {
		t.Errorf("expected valid flow with refs, got error: %v", err)
	}
}

func TestValidateFlow_WithInlineNodeTemplate(t *testing.T) {
	v := mustNewValidator(t)
	// Flow nodes array can contain inline node templates (cross-schema $ref).
	raw := []byte(`{
		"id": "flow-inline",
		"name": "Inline Nodes",
		"definition": {
			"nodes": [
				{
					"kind": "external",
					"id": "ext-inline",
					"label": "Inline External",
					"dataSource": "prom",
					"provider": "AWS",
					"metrics": {}
				}
			],
			"edges": []
		}
	}`)
	if err := v.ValidateFlow(raw); err != nil {
		t.Errorf("expected valid flow with inline node template, got error: %v", err)
	}
}

func TestValidateFlow_WithInlineEdgeTemplate(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-inline-edge",
		"name": "Inline Edges",
		"definition": {
			"nodes": [],
			"edges": [
				{
					"kind": "http-json",
					"id": "inline-e",
					"source": "a",
					"target": "b",
					"dataSource": "prom",
					"metrics": {}
				}
			]
		}
	}`)
	if err := v.ValidateFlow(raw); err != nil {
		t.Errorf("expected valid flow with inline edge template, got error: %v", err)
	}
}

func TestValidateFlow_WithLayout(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-layout",
		"name": "Layout Flow",
		"definition": {
			"nodes": [{"nodeId": "a"}],
			"edges": []
		},
		"layout": {
			"positions": {
				"a": {"x": 100, "y": 200}
			},
			"handleOverrides": {
				"e1": {"sourceHandle": "right", "targetHandle": "left"}
			},
			"edgeLabelOffsets": {
				"e1": {"x": 10, "y": -5}
			}
		}
	}`)
	if err := v.ValidateFlow(raw); err != nil {
		t.Errorf("expected valid flow with layout, got error: %v", err)
	}
}

// ─── Flow: invalid ────────────────────────────────────────────────────────────

func TestValidateFlow_MissingDefinition(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-bad",
		"name": "Missing Def"
	}`)
	if err := v.ValidateFlow(raw); err == nil {
		t.Error("expected error for missing 'definition', got nil")
	}
}

func TestValidateFlow_MissingName(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-bad",
		"definition": {"nodes": [], "edges": []}
	}`)
	if err := v.ValidateFlow(raw); err == nil {
		t.Error("expected error for missing 'name', got nil")
	}
}

func TestValidateFlow_DefinitionMissingEdges(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "flow-bad",
		"name": "Bad Def",
		"definition": {
			"nodes": []
		}
	}`)
	if err := v.ValidateFlow(raw); err == nil {
		t.Error("expected error for definition missing 'edges', got nil")
	}
}

func TestValidateFlow_EmptyObject(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateFlow([]byte(`{}`)); err == nil {
		t.Error("expected error for empty object, got nil")
	}
}

// ─── Datasources: valid ──────────────────────────────────────────────────────

func TestValidateDatasources_Valid(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`[
		{"name": "prometheus-main", "type": "prometheus"},
		{"name": "prometheus-secondary", "type": "prometheus"}
	]`)
	if err := v.ValidateDatasources(raw); err != nil {
		t.Errorf("expected valid datasources, got error: %v", err)
	}
}

func TestValidateDatasources_EmptyArray(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateDatasources([]byte(`[]`)); err != nil {
		t.Errorf("expected valid empty array, got error: %v", err)
	}
}

// ─── Datasources: invalid ────────────────────────────────────────────────────

func TestValidateDatasources_InvalidType(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`[{"name": "my-ds", "type": "graphite"}]`)
	if err := v.ValidateDatasources(raw); err == nil {
		t.Error("expected error for invalid type 'graphite', got nil")
	}
}

func TestValidateDatasources_MissingName(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`[{"type": "prometheus"}]`)
	if err := v.ValidateDatasources(raw); err == nil {
		t.Error("expected error for missing 'name', got nil")
	}
}

func TestValidateDatasources_ObjectInsteadOfArray(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{"name": "prom", "type": "prometheus"}`)
	if err := v.ValidateDatasources(raw); err == nil {
		t.Error("expected error when object given instead of array, got nil")
	}
}

func TestValidateDatasources_ExtraProperty(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`[{"name": "prom", "type": "prometheus", "url": "http://localhost:9090"}]`)
	if err := v.ValidateDatasources(raw); err == nil {
		t.Error("expected error for additionalProperties in datasource item, got nil")
	}
}

// ─── SLA defaults: valid ─────────────────────────────────────────────────────

func TestValidateSlaDefaults_Valid(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"node": {
			"cpu": {"warning": 70, "critical": 90},
			"memory": {"warning": 75, "critical": 95}
		},
		"http-json": {
			"errorRate": {"warning": 1, "critical": 5},
			"latencyP95": {"warning": 200, "critical": 500}
		}
	}`)
	if err := v.ValidateSlaDefaults(raw); err != nil {
		t.Errorf("expected valid SLA defaults, got error: %v", err)
	}
}

func TestValidateSlaDefaults_EmptyObject(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateSlaDefaults([]byte(`{}`)); err != nil {
		t.Errorf("expected valid empty SLA defaults, got error: %v", err)
	}
}

func TestValidateSlaDefaults_AllKinds(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"node": {"cpu": {"warning": 70, "critical": 90}},
		"http-json": {"rps": {"warning": 100, "critical": 50}},
		"http-xml": {"rps": {"warning": 100, "critical": 50}},
		"tcp-db": {"activeConnections": {"warning": 80, "critical": 95}},
		"amqp": {"queueDepth": {"warning": 1000, "critical": 5000}},
		"kafka": {"consumerLag": {"warning": 100, "critical": 1000}},
		"grpc": {"errorRate": {"warning": 1, "critical": 5}}
	}`)
	if err := v.ValidateSlaDefaults(raw); err != nil {
		t.Errorf("expected valid SLA defaults with all kinds, got error: %v", err)
	}
}

// ─── SLA defaults: invalid ───────────────────────────────────────────────────

func TestValidateSlaDefaults_InvalidTopLevelKey(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{"unknown-kind": {"cpu": {"warning": 70, "critical": 90}}}`)
	if err := v.ValidateSlaDefaults(raw); err == nil {
		t.Error("expected error for invalid top-level key, got nil")
	}
}

func TestValidateSlaDefaults_ThresholdMissingCritical(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{"node": {"cpu": {"warning": 70}}}`)
	if err := v.ValidateSlaDefaults(raw); err == nil {
		t.Error("expected error for threshold missing 'critical', got nil")
	}
}

func TestValidateSlaDefaults_ThresholdWrongType(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{"node": {"cpu": {"warning": "high", "critical": "very-high"}}}`)
	if err := v.ValidateSlaDefaults(raw); err == nil {
		t.Error("expected error for string threshold values, got nil")
	}
}

// ─── Malformed JSON ──────────────────────────────────────────────────────────

func TestValidate_MalformedJSON(t *testing.T) {
	v := mustNewValidator(t)

	cases := []struct {
		name     string
		validate func([]byte) error
	}{
		{"flow", v.ValidateFlow},
		{"nodeTemplate", v.ValidateNodeTemplate},
		{"edgeTemplate", v.ValidateEdgeTemplate},
		{"datasources", v.ValidateDatasources},
		{"slaDefaults", v.ValidateSlaDefaults},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.validate([]byte(`{not valid json`)); err == nil {
				t.Error("expected error for malformed JSON, got nil")
			}
		})
	}
}

// ─── FormatValidationError ───────────────────────────────────────────────────

func TestFormatValidationError_ProducesHumanReadableStrings(t *testing.T) {
	v := mustNewValidator(t)
	// Trigger a real validation error.
	err := v.ValidateNodeTemplate([]byte(`{"kind": "eks-service"}`))
	if err == nil {
		t.Fatal("expected error to format, got nil")
	}

	msgs := FormatValidationError(err)
	if len(msgs) == 0 {
		t.Fatal("expected non-empty error messages")
	}
	for i, msg := range msgs {
		if msg == "" {
			t.Errorf("message[%d] is empty", i)
		}
	}
}

func TestFormatValidationError_NonValidationError(t *testing.T) {
	plainErr := fmt.Errorf("something went wrong")
	msgs := FormatValidationError(plainErr)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message for plain error, got %d", len(msgs))
	}
	if msgs[0] != "something went wrong" {
		t.Errorf("expected plain error text, got %q", msgs[0])
	}
}

func TestFormatValidationError_IsValidationError(t *testing.T) {
	v := mustNewValidator(t)
	err := v.ValidateFlow([]byte(`{}`))
	if err == nil {
		t.Fatal("expected validation error")
	}
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		t.Fatal("expected jsonschema.ValidationError type")
	}
	msgs := FormatValidationError(err)
	if len(msgs) == 0 {
		t.Fatal("expected at least one formatted message")
	}
	// Each message should contain a path prefix.
	for _, msg := range msgs {
		if len(msg) < 2 {
			t.Errorf("message too short to be useful: %q", msg)
		}
	}
}

// ─── Edge cases: type confusion ──────────────────────────────────────────────

func TestValidateNodeTemplate_ArrayInput(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateNodeTemplate([]byte(`[1, 2, 3]`)); err == nil {
		t.Error("expected error when array given instead of object, got nil")
	}
}

func TestValidateNodeTemplate_NumberInput(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateNodeTemplate([]byte(`42`)); err == nil {
		t.Error("expected error when number given instead of object, got nil")
	}
}

func TestValidateNodeTemplate_BooleanInput(t *testing.T) {
	v := mustNewValidator(t)
	if err := v.ValidateNodeTemplate([]byte(`true`)); err == nil {
		t.Error("expected error when boolean given instead of object, got nil")
	}
}

func TestValidateEdgeTemplate_WrongTypeForMetrics(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"kind": "http-json",
		"id": "e1",
		"source": "a",
		"target": "b",
		"dataSource": "prom",
		"metrics": "should-be-object"
	}`)
	if err := v.ValidateEdgeTemplate(raw); err == nil {
		t.Error("expected error when metrics is a string, got nil")
	}
}

func TestValidateFlow_WrongTypeForNodes(t *testing.T) {
	v := mustNewValidator(t)
	raw := []byte(`{
		"id": "f1",
		"name": "Bad",
		"definition": {
			"nodes": "not-an-array",
			"edges": []
		}
	}`)
	if err := v.ValidateFlow(raw); err == nil {
		t.Error("expected error when nodes is a string, got nil")
	}
}
