import { Router } from 'express';
import vsts from '../service/vsts';
import {
  statusFor,
  buildStatus,
  sortByOrder,
  keepOnlyTasks,
  organizeIntoEnvironmentBuckets,
  findFirstNotInProgress,
  orderByRank,
  statusForRelease
} from '../transformers/pipelines';

const router = Router();

/** Response Body
{
  name: <string>,
  status: <string:'success', 'failure', 'unknown'>,
  stages: [ {
    name: <string>,
    status: <string:'success', 'failure', 'progress', 'pending', 'cancelled', 'unknown'>
  } ]
}
 */
router.get('/:id', (req, res) => {
  console.log('** Hit API GET /pipelines');

  const response = {};
  return vsts.getMostRecentBuild(req.params.id)
    .then(data => {
      const build = data.value[0];
      response.name = build.definition.name;

      if(build.status !== 'completed') {
        return vsts.getMostRecentCompletedBuild(req.params.id).then(d => {
          response.status = buildStatus(d.value[0]);
          return vsts.getBuildTimeline(build.id);
        }).catch(() => {
          response.status = 'failure';
        });
      } else {
        response.status = buildStatus(build);
        return vsts.getBuildTimeline(build.id);
      }
    })
    .then(data => data.records)
    .then(keepOnlyTasks)
    .then(sortByOrder)
    .then(records => {
      response.stages = records.map(record => {
        return {
          name: record.name,
          status: statusFor(record)
        };
      });
    })

    .then(() => vsts.getMostRecentReleases().then(d => d.value))
    .then(organizeIntoEnvironmentBuckets)
    .then(buckets => {
      return Object.keys(buckets).map(env => findFirstNotInProgress(buckets[env]));
    })
    .then(orderByRank)
    .then(envs => {
      response.stages = response.stages.concat(envs.map(env => {
        return {
          name: env.name,
          status: statusForRelease(env)
        };
      }));
    })
    .then(() => {
      return res.status(200).json(response);
    });
});

export default router;
