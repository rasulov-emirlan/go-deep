package main

type Cat struct {
	Name  string `json:"name"`
	Lives int    `json:"lives"`
}

type Dog struct {
	Name  string `json:"name"`
	Breed string `json:"breed"`
}

func Parse(body []byte) (any, error) {
	// your code here
	return nil, nil
}
