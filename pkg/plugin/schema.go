package plugin

import (
	"bytes"
	_ "embed"
	"errors"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// ─── Embedded schema files ─────────────────────────────────────────────────
// Copies of schemas/*.schema.json — go:embed requires files within or below
// the package directory, so the canonical schemas/ at project root are copied
// to pkg/plugin/schemas/ at development time.

//go:embed schemas/flow.schema.json
var flowSchemaJSON []byte

//go:embed schemas/node-template.schema.json
var nodeTemplateSchemaJSON []byte

//go:embed schemas/edge-template.schema.json
var edgeTemplateSchemaJSON []byte

//go:embed schemas/datasources.schema.json
var datasourcesSchemaJSON []byte

//go:embed schemas/sla-defaults.schema.json
var slaDefaultsSchemaJSON []byte

// Schema IDs matching the $id fields in the JSON schema files.
const (
	flowSchemaID         = "https://bernspedras.dev/topology-dashboard/schemas/flow.schema.json"
	nodeTemplateSchemaID = "https://bernspedras.dev/topology-dashboard/schemas/node-template.schema.json"
	edgeTemplateSchemaID = "https://bernspedras.dev/topology-dashboard/schemas/edge-template.schema.json"
	datasourcesSchemaID  = "https://bernspedras.dev/topology-dashboard/schemas/datasources.schema.json"
	slaDefaultsSchemaID  = "https://bernspedras.dev/topology-dashboard/schemas/sla-defaults.schema.json"
)

// ─── SchemaValidator ───────────────────────────────────────────────────────

// SchemaValidator validates JSON data against the embedded topology schemas.
type SchemaValidator struct {
	flowSchema         *jsonschema.Schema
	nodeTemplateSchema *jsonschema.Schema
	edgeTemplateSchema *jsonschema.Schema
	datasourcesSchema  *jsonschema.Schema
	slaDefaultsSchema  *jsonschema.Schema
}

// NewSchemaValidator compiles all embedded schemas and returns a ready-to-use
// validator. Call once at startup; the compiled schemas are safe for concurrent use.
func NewSchemaValidator() (*SchemaValidator, error) {
	c := jsonschema.NewCompiler()

	// Add all schemas as resources so cross-schema $ref can resolve.
	resources := []struct {
		id   string
		data []byte
	}{
		{nodeTemplateSchemaID, nodeTemplateSchemaJSON},
		{edgeTemplateSchemaID, edgeTemplateSchemaJSON},
		{flowSchemaID, flowSchemaJSON},
		{datasourcesSchemaID, datasourcesSchemaJSON},
		{slaDefaultsSchemaID, slaDefaultsSchemaJSON},
	}

	for _, r := range resources {
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(r.data))
		if err != nil {
			return nil, fmt.Errorf("failed to parse schema %s: %w", r.id, err)
		}
		if err := c.AddResource(r.id, doc); err != nil {
			return nil, fmt.Errorf("failed to add schema %s: %w", r.id, err)
		}
	}

	// Compile each schema.
	flowSch, err := c.Compile(flowSchemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to compile flow schema: %w", err)
	}
	nodeSch, err := c.Compile(nodeTemplateSchemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to compile node template schema: %w", err)
	}
	edgeSch, err := c.Compile(edgeTemplateSchemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to compile edge template schema: %w", err)
	}
	dsSch, err := c.Compile(datasourcesSchemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to compile datasources schema: %w", err)
	}
	slaSch, err := c.Compile(slaDefaultsSchemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to compile sla-defaults schema: %w", err)
	}

	return &SchemaValidator{
		flowSchema:         flowSch,
		nodeTemplateSchema: nodeSch,
		edgeTemplateSchema: edgeSch,
		datasourcesSchema:  dsSch,
		slaDefaultsSchema:  slaSch,
	}, nil
}

// ─── Validation methods ────────────────────────────────────────────────────

// ValidateFlow validates raw JSON against the flow schema.
func (v *SchemaValidator) ValidateFlow(raw []byte) error {
	return v.validate(v.flowSchema, raw)
}

// ValidateNodeTemplate validates raw JSON against the node template schema.
func (v *SchemaValidator) ValidateNodeTemplate(raw []byte) error {
	return v.validate(v.nodeTemplateSchema, raw)
}

// ValidateEdgeTemplate validates raw JSON against the edge template schema.
func (v *SchemaValidator) ValidateEdgeTemplate(raw []byte) error {
	return v.validate(v.edgeTemplateSchema, raw)
}

// ValidateDatasources validates raw JSON against the datasources schema.
func (v *SchemaValidator) ValidateDatasources(raw []byte) error {
	return v.validate(v.datasourcesSchema, raw)
}

// ValidateSlaDefaults validates raw JSON against the SLA defaults schema.
func (v *SchemaValidator) ValidateSlaDefaults(raw []byte) error {
	return v.validate(v.slaDefaultsSchema, raw)
}

func (v *SchemaValidator) validate(schema *jsonschema.Schema, raw []byte) error {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return schema.Validate(doc)
}

// ─── Error formatting ──────────────────────────────────────────────────────

// FormatValidationError converts a jsonschema.ValidationError into a slice of
// human-readable strings suitable for an HTTP 400 response.
func FormatValidationError(err error) []string {
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		return []string{err.Error()}
	}

	output := ve.BasicOutput()
	var msgs []string
	collectOutputErrors(output, &msgs)
	if len(msgs) == 0 {
		return []string{ve.Error()}
	}
	return msgs
}

func collectOutputErrors(unit *jsonschema.OutputUnit, msgs *[]string) {
	if unit.Error != nil {
		path := unit.InstanceLocation
		if path == "" {
			path = "/"
		}
		*msgs = append(*msgs, fmt.Sprintf("%s: %s", path, unit.Error.String()))
	}
	for i := range unit.Errors {
		collectOutputErrors(&unit.Errors[i], msgs)
	}
}
