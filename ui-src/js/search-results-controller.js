angular
    .module('nzbhydraApp')
    .controller('SearchResultsController', SearchResultsController);


//SearchResultsController.$inject = ['blockUi'];
function SearchResultsController($stateParams, $scope, $q, $timeout, blockUI, SearchService, $http, $uibModal, $sce, growl) {

    $scope.sortPredicate = "epoch";
    $scope.sortReversed = true;

    $scope.limitTo = 101;
    $scope.offset = 0;

    //Handle incoming data
    $scope.providersearches = $stateParams.providersearches;

    $scope.providerDisplayState = []; //Stores if a provider's results should be displayed or not

    $scope.providerResultsInfo = {}; //Stores information about the provider's results like how many we already retrieved

    $scope.groupExpanded = {};

    $scope.doShowDuplicates = false;

    $scope.selected = {};

    //Initially set visibility of all found providers to true, they're needed for initial filtering / sorting
    _.forEach($scope.providersearches, function (ps) {
        $scope.providerDisplayState[ps.provider] = true;
    });

    _.forEach($scope.providersearches, function (ps) {
        $scope.providerResultsInfo[ps.provider] = {loadedResults: ps.loaded_results};
    });

    //Process results
    $scope.results = $stateParams.results;
    $scope.total = $stateParams.total;
    $scope.resultsCount = $stateParams.resultsCount;
    $scope.filteredResults = sortAndFilter($scope.results);
    stopBlocking();


    //Returns the content of the property (defined by the current sortPredicate) of the first group element 
    $scope.firstResultPredicate = firstResultPredicate;
    function firstResultPredicate(item) {
        return item[0][$scope.sortPredicate];
    }

    //Returns the unique group identifier which allows angular to keep track of the grouped search results even after filtering, making filtering by providers a lot faster (albeit still somewhat slow...)  
    $scope.groupId = groupId;
    function groupId(item) {
        return item[0][0].title.toLowerCase();
    }

    //Block the UI and return after timeout. This way we make sure that the blocking is done before angular starts updating the model/view. There's probably a better way to achieve that?
    function startBlocking(message) {
        console.log("Blocking");
        var deferred = $q.defer();
        blockUI.start(message);
        $timeout(function () {
            deferred.resolve();
        }, 100);
        return deferred.promise;
    }

    //Set sorting according to the predicate. If it's the same as the old one, reverse, if not sort by the given default (so that age is descending, name ascending, etc.)
    //Sorting (and filtering) are really slow (about 2 seconds for 1000 results from 5 providers) but I haven't found any way of making it faster, apart from the tracking 
    $scope.setSorting = setSorting;
    function setSorting(predicate, reversedDefault) {
        startBlocking("Sorting / filtering...").then(function () {

            if (predicate == $scope.sortPredicate) {
                $scope.sortReversed = !$scope.sortReversed;
            } else {
                $scope.sortReversed = reversedDefault;
            }
            $scope.sortPredicate = predicate;
            $scope.filteredResults = sortAndFilter($scope.results);
            blockUI.reset();
        });
    }


    function sortAndFilter(results) {
        //Remove elements of which the provider is currently hidden
        results = _.filter(results, function (item) {
            return $scope.providerDisplayState[item.provider];
        });


        //Group by sameness
        results = _.groupBy(results, function (element) {
            return element.hash;
        });

        //Sort duplicate group by provider score
        results = _.map(results, function (hashGroup) {
            var sortedByScore = _.sortBy(hashGroup, "providerscore");
            sortedByScore.reverse();
            return sortedByScore;
        });

        results = _.groupBy(results, function (element) {
            return element[0].title.toLowerCase();
        });

        results = _.map(results, function (titleGroup) {
            ////Sort title group by provider score first
            //var sortedTitleGroup = _.sortBy(titleGroup, function (hashGroup) {
            //    return hashGroup[0]["providerscore"];
            //});
            //sortedTitleGroup.reverse();

            //And then by the first result's values (which is the one shown if no rows are expanded)
            var sortedTitleGroup = _.sortBy(titleGroup, function (hashGroup) {
                return hashGroup[0]["providerscore"] + "_" + hashGroup[0][$scope.sortPredicate];
                //return hashGroup[0][$scope.sortPredicate];
            });
            if ($scope.sortReversed) {
                sortedTitleGroup.reverse();
            }
            return sortedTitleGroup;
        });

        var filteredResults = _.sortBy(results, function (group) {
            return group[0][0][$scope.sortPredicate];
        });

        if ($scope.sortReversed) {
            filteredResults.reverse();
        }

        console.log(filteredResults);
        return filteredResults;
    }

    $scope.toggleTitlegroupExpand = function toggleTitlegroupExpand(titleGroup) {
        $scope.groupExpanded[titleGroup[0][0].title] = !$scope.groupExpanded[titleGroup[0][0].title];
        $scope.groupExpanded[titleGroup[0][0].hash] = !$scope.groupExpanded[titleGroup[0][0].hash];
    };


    //Clear the blocking
    $scope.stopBlocking = stopBlocking;
    function stopBlocking() {

        blockUI.reset();
    }

    $scope.loadMore = loadMore;
    function loadMore() {
        $scope.offset += 100;
        console.log("Increasing the offset to " + $scope.offset);

        startBlocking("Loading more results...").then(function () {
            SearchService.loadMore($scope.offset).then(function (data) {
                console.log("Returned more results:");
                console.log(data.results);
                console.log($scope.results);
                console.log("Total: " + data.total);
                $scope.results = $scope.results.concat(data.results);
                $scope.filteredResults = sortAndFilter($scope.results);
                $scope.total = data.total;
                $scope.resultsCount += data.resultsCount;
                console.log("Total results in $scope.results: " + $scope.results.length);

                stopBlocking();
            });
        });
    }


    //Filters the results according to new visibility settings.
    $scope.toggleProviderDisplay = toggleProviderDisplay;
    function toggleProviderDisplay() {
        startBlocking("Filtering. Sorry...").then(function () {
            $scope.filteredResults = sortAndFilter($scope.results);
        }).then(function () {
            stopBlocking();
        });

    }

    $scope.countResults = countResults;
    function countResults() {
        return $scope.results.length;
    }

    $scope.downloadSelected = downloadSelected;
    function downloadSelected() {
        
        var guids = Object.keys($scope.selected);

        console.log(guids);
        $http.put("internalapi/addnzbs", {guids: angular.toJson(guids)}).success(function (response) {
            if (response.success) {
                console.log("success");
                growl.info("Successfully added " + response.added + " of " + response.of + " NZBs");
            } else {
                growl.error("Error while adding NZBs");
            }
        }).error(function () {
            growl.error("Error while adding NZBs"); 
        });
    }


}