package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
)

import (
	"github.com/gorilla/mux"
)

type IPRange struct {
	Start string
	End   string
}

type ASNRanges struct {
	ASN     int
	Name    string
	Country string
	Ranges  []IPRange
}

type CountryRanges struct {
	Country string
	Ranges  []IPRange
}

type ASNSearchResult struct {
	ASN        int
	Name       string
	Country    string
	RangeCount int
}

func scanASNFile(path string, cb func(start string, end string, asn int, country string, name string)) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), "\t")
		if len(fields) < 5 {
			continue
		}
		asn, err := strconv.Atoi(fields[2])
		if err != nil || asn == 0 {
			continue
		}
		cb(fields[0], fields[1], asn, fields[3], fields[4])
	}
	return scanner.Err()
}

func parseASNArg(arg string) int {
	arg = strings.TrimSpace(strings.ToUpper(arg))
	arg = strings.TrimPrefix(arg, "AS")
	asn, err := strconv.Atoi(arg)
	if err != nil || asn <= 0 {
		return 0
	}
	return asn
}

func collectASNRanges(path string, asns []int) ([]ASNRanges, error) {
	byASN := map[int]*ASNRanges{}
	order := []int{}
	for _, asn := range asns {
		if _, exists := byASN[asn]; !exists {
			byASN[asn] = &ASNRanges{ASN: asn, Ranges: []IPRange{}}
			order = append(order, asn)
		}
	}

	err := scanASNFile(path, func(start string, end string, asn int, country string, name string) {
		entry, exists := byASN[asn]
		if !exists {
			return
		}
		if entry.Name == "" {
			entry.Name = name
			entry.Country = country
		}
		entry.Ranges = append(entry.Ranges, IPRange{Start: start, End: end})
	})
	if err != nil {
		return nil, err
	}

	result := []ASNRanges{}
	for _, asn := range order {
		result = append(result, *byASN[asn])
	}
	return result, nil
}

func collectCountryRanges(path string, countries []string) ([]CountryRanges, error) {
	byCountry := map[string]*CountryRanges{}
	order := []string{}
	for _, cc := range countries {
		cc = strings.ToUpper(strings.TrimSpace(cc))
		if len(cc) != 2 {
			continue
		}
		if _, exists := byCountry[cc]; !exists {
			byCountry[cc] = &CountryRanges{Country: cc, Ranges: []IPRange{}}
			order = append(order, cc)
		}
	}

	err := scanASNFile(path, func(start string, end string, asn int, country string, name string) {
		entry, exists := byCountry[country]
		if !exists {
			return
		}
		entry.Ranges = append(entry.Ranges, IPRange{Start: start, End: end})
	})
	if err != nil {
		return nil, err
	}

	result := []CountryRanges{}
	for _, cc := range order {
		result = append(result, *byCountry[cc])
	}
	return result, nil
}

func searchASNs(path string, query string, limit int) ([]ASNSearchResult, error) {
	query = strings.TrimSpace(query)
	exactASN := parseASNArg(query)
	nameQuery := strings.ToUpper(query)

	found := map[int]*ASNSearchResult{}
	err := scanASNFile(path, func(start string, end string, asn int, country string, name string) {
		entry, exists := found[asn]
		if !exists {
			if exactASN != 0 {
				if asn != exactASN {
					return
				}
			} else if !strings.Contains(strings.ToUpper(name), nameQuery) {
				return
			}
			entry = &ASNSearchResult{ASN: asn, Name: name, Country: country}
			found[asn] = entry
		}
		entry.RangeCount++
	})
	if err != nil {
		return nil, err
	}

	results := []ASNSearchResult{}
	for _, entry := range found {
		results = append(results, *entry)
	}
	sort.Slice(results, func(i, j int) bool {
		if results[i].RangeCount != results[j].RangeCount {
			return results[i].RangeCount > results[j].RangeCount
		}
		return results[i].ASN < results[j].ASN
	})
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func pluginGetASNRanges(w http.ResponseWriter, r *http.Request) {
	asns := []int{}
	for _, arg := range strings.Split(mux.Vars(r)["asns"], ",") {
		if asn := parseASNArg(arg); asn != 0 {
			asns = append(asns, asn)
		}
	}
	if len(asns) == 0 {
		http.Error(w, "no valid ASNs", 400)
		return
	}

	result, err := collectASNRanges(ASN_FILENAME, asns)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func pluginGetCountryRanges(w http.ResponseWriter, r *http.Request) {
	countries := strings.Split(mux.Vars(r)["countries"], ",")

	result, err := collectCountryRanges(ASN_FILENAME, countries)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	if len(result) == 0 {
		http.Error(w, "no valid country codes", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func pluginGetASNSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(mux.Vars(r)["query"])
	if len(query) < 2 {
		http.Error(w, "query too short", 400)
		return
	}

	result, err := searchASNs(ASN_FILENAME, query, 25)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
