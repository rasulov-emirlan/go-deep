package main

import "sync"

func CheckURLs(urls <-chan string, workers int, fetch func(url string) (int, error)) <-chan string {
	out := make(chan string)
	var wg sync.WaitGroup
	for range workers {
		wg.Go(func() {
			for u := range urls {
				status := "not ok"
				if code, err := fetch(u); err == nil && code == 200 {
					status = "ok"
				}
				out <- u + " " + status
			}
		})
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}
