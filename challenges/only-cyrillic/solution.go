package main

import "regexp"

var nonRussian = regexp.MustCompile(`[^а-яёА-ЯЁ]+`)

func OnlyCyrillic(s string) string {
	return nonRussian.ReplaceAllString(s, "")
}
