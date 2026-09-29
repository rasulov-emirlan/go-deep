package main

import "fmt"

func parseFails(body string) (bool, string) {
	v, err := Parse([]byte(body))
	return err != nil, fmt.Sprintf("want an error, got %#v", v)
}

func main() {
	check("cat", func() (any, any) {
		v, _ := Parse([]byte(`{"kind":"cat","entity":{"name":"Tom","lives":9}}`))
		return v, Cat{Name: "Tom", Lives: 9}
	})
	check("dog", func() (any, any) {
		v, _ := Parse([]byte(`{"kind":"dog","entity":{"name":"Rex","breed":"husky"}}`))
		return v, Dog{Name: "Rex", Breed: "husky"}
	})
	ok("unknown kind is an error", func() (bool, string) {
		return parseFails(`{"kind":"admin","entity":{"name":"x"}}`)
	})
	ok("unknown entity field is an error", func() (bool, string) {
		return parseFails(`{"kind":"cat","entity":{"name":"Tom","isAdmin":true}}`)
	})
	ok("fields of the other kind are an error", func() (bool, string) {
		return parseFails(`{"kind":"dog","entity":{"name":"Rex","lives":9}}`)
	})
	ok("malformed JSON is an error", func() (bool, string) {
		return parseFails(`{"kind":"cat","entity":`)
	})
	done()
}
