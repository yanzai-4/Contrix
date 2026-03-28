# Schema Designer Guide

Schema Designer defines the contract boundary for each endpoint.

## Input Modes
- `text`: runtime expects `inputText`
- `json`: runtime expects `inputJson` object validated against input schema

## Editing Modes
- **Builder mode**: visual field editor
- **Raw JSON mode**: direct schema document editing

## Supported Contract Elements
- Primitive/object/array field types
- Required vs optional fields
- Nested object/array structures
- Enum values
- `nullable` and `default`
- Field `description`, `constraints`, and `example`
- Object-level `additionalProperties` control

## Output Contract Discipline
Runtime validation and repair are driven by output schema.  
For production endpoints, keep output schema strict and explicit to minimize downstream ambiguity.

## Save Behavior
Saving schema updates:
1. Persists endpoint schema
2. Marks endpoint spec state as `stale`
3. Triggers auto-sync path (spec/prompt refresh attempt)

Use runtime preflight and prompt preview to verify endpoint readiness after schema changes.
