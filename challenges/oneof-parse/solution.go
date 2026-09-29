package main

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type Cat struct {
	Name  string `json:"name"`
	Lives int    `json:"lives"`
}

type Dog struct {
	Name  string `json:"name"`
	Breed string `json:"breed"`
}

type envelope struct {
	Kind   string          `json:"kind"`
	Entity json.RawMessage `json:"entity"`
}

func decodeStrict(data []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func Parse(body []byte) (any, error) {
	var env envelope
	if err := decodeStrict(body, &env); err != nil {
		return nil, err
	}
	switch env.Kind {
	case "cat":
		var c Cat
		err := decodeStrict(env.Entity, &c)
		return c, err
	case "dog":
		var d Dog
		err := decodeStrict(env.Entity, &d)
		return d, err
	default:
		return nil, fmt.Errorf("unknown kind %q", env.Kind)
	}
}
