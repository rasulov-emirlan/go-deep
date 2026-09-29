package main

import "sync"

func Crawl(urls []string, k int, fetch func(url string) int) []int {
	res := make([]int, len(urls))
	sem := make(chan struct{}, k)
	var wg sync.WaitGroup
	for i, u := range urls {
		sem <- struct{}{}
		wg.Go(func() {
			defer func() { <-sem }()
			res[i] = fetch(u)
		})
	}
	wg.Wait()
	return res
}
