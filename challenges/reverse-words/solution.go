package main

import (
	"strings"
	"unicode"
)

func ReverseWords(s string) string {
	words := strings.Split(s, " ")
	for i, w := range words {
		r := []rune(w)
		if isPalindrome(r) {
			continue
		}
		for a, b := 0, len(r)-1; a < b; a, b = a+1, b-1 {
			r[a], r[b] = r[b], r[a]
		}
		words[i] = string(r)
	}
	return strings.Join(words, " ")
}

func isPalindrome(r []rune) bool {
	for a, b := 0, len(r)-1; a < b; a, b = a+1, b-1 {
		if unicode.ToLower(r[a]) != unicode.ToLower(r[b]) {
			return false
		}
	}
	return true
}
