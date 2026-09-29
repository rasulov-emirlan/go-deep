package main

import (
	"fmt"
	"sync"
)

func version(url string, t uint64) Document {
	return Document{URL: url, PubDate: t * 10, FetchTime: t, Text: fmt.Sprintf("v%d", t)}
}

func merged(url string, first, last uint64) *Document {
	return &Document{URL: url, PubDate: first * 10, FetchTime: last, Text: fmt.Sprintf("v%d", last), FirstFetchTime: first}
}

func main() {
	check("first message passes through", func() (any, any) {
		return NewProcessor().Process(version("a", 2)), merged("a", 2, 2)
	})
	check("older version fills the earliest fields", func() (any, any) {
		p := NewProcessor()
		p.Process(version("a", 2))
		return p.Process(version("a", 1)), merged("a", 1, 2)
	})
	check("newer version fills the latest fields", func() (any, any) {
		p := NewProcessor()
		p.Process(version("a", 2))
		p.Process(version("a", 1))
		return p.Process(version("a", 3)), merged("a", 1, 3)
	})
	check("duplicate or in-between version gives nil", func() (any, any) {
		p := NewProcessor()
		p.Process(version("a", 1))
		p.Process(version("a", 5))
		return []*Document{p.Process(version("a", 5)), p.Process(version("a", 3))}, []*Document{nil, nil}
	})
	check("URLs are independent", func() (any, any) {
		p := NewProcessor()
		p.Process(version("a", 1))
		return p.Process(version("b", 7)), merged("b", 7, 7)
	})
	check("safe for concurrent use", func() (any, any) {
		p := NewProcessor()
		var wg sync.WaitGroup
		for t := uint64(1); t <= 100; t++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				p.Process(version("a", t))
				p.Process(version("a", t)) // redelivery
			}()
		}
		wg.Wait()
		return p.Process(version("a", 101)), merged("a", 1, 101)
	})
	done()
}
