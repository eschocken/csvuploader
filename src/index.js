import React, { useCallback, useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useDropzone } from "react-dropzone";
import csv from "csv";
import "./styles.css";
import "monday-ui-react-core/dist/main.css"
import { Button } from "monday-ui-react-core";
import mondaySdk from "monday-sdk-js";
import { Promise } from "bluebird";
import _ from 'lodash';

const monday = mondaySdk();

function App() {
  
  const [data, setData] = useState([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [boardId, setBoardId] = useState('');
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(acceptedFiles => {
    const reader = new FileReader();
    console.log('Board ID', boardId);

    reader.onabort = () => console.log("file reading was aborted");
    reader.onerror = () => console.log("file reading failed");
    reader.onload = () => {
      csv.parse(reader.result, {encoding: 'utf8', quote: '', ltrim: true, rtrim: true, delimiter: ',' }, (err, csvdata) => {
        console.log('err',err);
        console.log('csvdata', csvdata);
        csvdata.shift();
        setData(csvdata); 
      });
    };
    acceptedFiles.forEach(file => reader.readAsText(file));
  }, [boardId]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  useEffect(() => {
    async function setBoardID() {
      const res = await monday.get("context");
      const bid = res.data.boardId;

      setBoardId(bid);
      setLoading(false)
    }
    setBoardID();
  }, [loading])

  const increment = () => {
    setProgress(progress=>progress+1);
  }

    const upload = async () => {
      try {
        setUploading(true);
        setProgress(0);

        const allIds = await getAllIds();
        const updatedIds = [];

        const createData = _.differenceWith(data, allIds, (row,item) => {
          return row[1] === item.value
        });
        const updateData = _.intersectionWith(data, allIds, (row,item) => {
          return row[1] === item.value
        });

        console.log('Create Data:', createData);
        console.log('Update Data:', updateData);

        
        Promise.map(createData, async function(row) {
          try {
          const columnValues = csvRowToColumnValue(row);
          const itemName = row[0];
          console.log('Item Column Values', columnValues)
          return createItem(columnValues, itemName, updatedIds).then(()=>increment()).catch(e=>console.log('inside catch', e))
          } catch(err) {
            console.log('error!', err);
          }
        }, {concurrency: 1})
        .then(()=> {
          Promise.map(updateData, async function(row) {
            try {
            const columnValues = csvRowToColumnValue(row);
            const itemName = row[0];
            return updateItem(row[1], itemName, columnValues, allIds).then(()=>increment()).catch(e=>console.log('inside catch', e))
            } catch(err) {
              console.log('error!', err);
            }
          }, {concurrency: 1})
          .then(()=>window.location.reload(false))
        })
      } catch(error) {
        console.log('error',error);
      }
    }

  const createItem = async (columnValues, itemName, updatedIds) => {
    try {
        const mutation = `mutation create_item($boardId: Int!, $itemName: String, $columnValue: JSON) {
            create_item(board_id:$boardId, item_name:$itemName, column_values:$columnValue, create_labels_if_missing: true) {
              id
            }
        }`;
        
        const variables = { boardId:Number(boardId), itemName, columnValue: JSON.stringify(columnValues)};
        return monday.api(mutation, { variables })
        .then(res=>{
          console.log('Create Item Response:',res);
          updatedIds.push({id:Number(res.data.create_item.id)})});
    } catch (error) {
        console.log('Create Item Error:', error);
    }
  }

  const getItemByProjectNumber = async (projectNumber, allIds) => {
    const itemId = allIds.find(val => {
      return val.value === projectNumber
    });
    return itemId;
  };

  const updateItem = async (projectNumber, name, columnValues, allIds) => {
    try {
        console.log('Column Values:', columnValues);
        columnValues['name'] = name;
        let itemId = await getItemByProjectNumber(projectNumber, allIds);
        itemId = itemId.id;

        const mutation = `mutation ($boardId:Int!, $itemId:Int!, $columnValues:JSON!) {
            change_multiple_column_values(item_id:$itemId, board_id:$boardId, column_values: $columnValues, create_labels_if_missing: true) {
               id
            }
        }`;
        const variables = { boardId, itemId, columnValues: JSON.stringify(columnValues) };
        return monday.api(mutation, {variables})
        .then((res)=>{ 
          console.log('Update Item Response:',res) });
    } catch (error) {
        console.log('Update Item Error:', error);
    }
  }

  const csvRowToColumnValue = (csvRow) => {
    const columnValue = {
        text: csvRow[1],
        numbers: csvRow[2],
        status: {'label': csvRow[3]},
        date: {'date': csvRow[4]}
    };
    return columnValue;
  }

  const getAllIds = async () => {
    if(!boardId) return [];
    const query = `query {
        boards(ids:${boardId}) {
          items {
            id  
            column_values(ids:"text") {
              value
            }
          }
        }
    }`;
    const response = await monday.api(query);
    return response['data']['boards'][0]['items'].map(item => {
        return {
            'value': JSON.parse(item.column_values[0]['value']),
            'id':JSON.parse(item.id)
        };
    });
  }

  return (
    <div className="App">
      {(loading) ? <p>Loading...</p> : <div {...getRootProps()}>
        <input {...getInputProps()} />
        <p>Click or drag & drop a CSV file</p>
      </div>}
      {data.length > 0 && <Button disabled={uploading} onClick={upload}>Update {data.length} entries</Button>}
      {progress > 0 && <div>Updating {progress} / {data.length}</div>}
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
