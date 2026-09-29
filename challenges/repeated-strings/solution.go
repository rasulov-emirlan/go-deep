package main

func Repeated(in []string) []string {
	count := make(map[string]int, len(in))
	for _, s := range in {
		count[s]++
	}
	res := []string{}
	for _, s := range in {
		if count[s] > 1 {
			res = append(res, s)
			count[s] = 0
		}
	}
	return res
}
